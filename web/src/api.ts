import type { DateRange } from './dates'

// Types match the Go API's JSON. Responses are treated as unknown and checked
// here, so the rest of the app can trust them.

export type Week = { start: string; isoYear: number; isoWeek: number }

export type Person = { id: number; name: string; weeklyHours: number }

export type CapacityData = {
  from: string
  to: string
  weeks: Week[]
  people: Person[]
  /** Allocated hours keyed by cellKey(personId, weekStart). Missing means 0. */
  allocations: ReadonlyMap<string, number>
}

export function cellKey(personId: number, weekStart: string): string {
  return `${personId}:${weekStart}`
}

/** A request that reached no answer we can use; `message` is fit to show. */
export class ApiError extends Error {
  readonly kind: 'network' | 'http' | 'malformed'
  readonly status: number | null

  constructor(kind: ApiError['kind'], message: string, status: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

export async function fetchCapacity(range: DateRange, signal: AbortSignal): Promise<CapacityData> {
  const params = new URLSearchParams({ from: range.from, to: range.to })
  return parseCapacity(await request(`/api/capacity?${params}`, { signal }))
}

async function request(url: string, init: RequestInit): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new ApiError('network', "Couldn't reach the server. Check your connection and try again.")
  }

  let body: unknown
  try {
    body = await res.json()
  } catch (error) {
    if (isAbortError(error)) throw error
    body = undefined
  }

  if (!res.ok) {
    const serverMessage = isRecord(body) && typeof body.error === 'string' ? body.error : null
    throw new ApiError('http', serverMessage ?? `The server answered ${res.status}.`, res.status)
  }
  if (body === undefined) throw malformed()
  return body
}

function malformed(): ApiError {
  return new ApiError('malformed', "The server's response couldn't be read.")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parsePerson(value: unknown): Person {
  if (
    isRecord(value) &&
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    typeof value.weeklyHours === 'number'
  ) {
    return { id: value.id, name: value.name, weeklyHours: value.weeklyHours }
  }
  throw malformed()
}

function parseWeek(value: unknown): Week {
  if (
    isRecord(value) &&
    typeof value.start === 'string' &&
    typeof value.isoYear === 'number' &&
    typeof value.isoWeek === 'number'
  ) {
    return { start: value.start, isoYear: value.isoYear, isoWeek: value.isoWeek }
  }
  throw malformed()
}

function parseCapacity(value: unknown): CapacityData {
  if (
    !isRecord(value) ||
    typeof value.from !== 'string' ||
    typeof value.to !== 'string' ||
    !Array.isArray(value.weeks) ||
    !Array.isArray(value.people) ||
    !isRecord(value.allocations)
  ) {
    throw malformed()
  }

  const allocations = new Map<string, number>()
  for (const [personId, byWeek] of Object.entries(value.allocations)) {
    if (!isRecord(byWeek)) throw malformed()
    for (const [weekStart, hours] of Object.entries(byWeek)) {
      if (typeof hours !== 'number') throw malformed()
      allocations.set(cellKey(Number(personId), weekStart), hours)
    }
  }

  return {
    from: value.from,
    to: value.to,
    weeks: value.weeks.map(parseWeek),
    people: value.people.map(parsePerson),
    allocations,
  }
}
