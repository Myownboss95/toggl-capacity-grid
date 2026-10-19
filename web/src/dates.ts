// Calendar dates are YYYY-MM-DD strings. All arithmetic goes through UTC
// milliseconds, so the browser's time zone can never shift a date by a day.

const DAY_MS = 86_400_000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Inclusive calendar range, as sent to GET /api/capacity. */
export type DateRange = { from: string; to: string }

/** The API rejects ranges longer than this (see maxRangeWeeks in the Go API). */
export const MAX_RANGE_WEEKS = 26

function toUTC(date: string): number | null {
  const match = ISO_DATE.exec(date)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const ms = Date.UTC(year, month - 1, day)
  const roundTrip = new Date(ms)
  const exists =
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day
  return exists ? ms : null
}

function parse(date: string): number {
  const ms = toUTC(date)
  if (ms === null) throw new Error(`not a calendar date: ${date}`)
  return ms
}

function format(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function isValidDate(date: string): boolean {
  return toUTC(date) !== null
}

export function addDays(date: string, days: number): string {
  return format(parse(date) + days * DAY_MS)
}

/** The Monday on or before `date` (ISO weeks start on Monday). */
export function startOfIsoWeek(date: string): string {
  const ms = parse(date)
  const daysSinceMonday = (new Date(ms).getUTCDay() + 6) % 7
  return format(ms - daysSinceMonday * DAY_MS)
}

/** The Sunday on or after `date`. */
export function endOfIsoWeek(date: string): string {
  return addDays(startOfIsoWeek(date), 6)
}

/** Widens a range to whole ISO weeks, the same way the API does. */
export function toWholeWeeks(range: DateRange): DateRange {
  return { from: startOfIsoWeek(range.from), to: endOfIsoWeek(range.to) }
}

export function shiftWeeks(range: DateRange, weeks: number): DateRange {
  return { from: addDays(range.from, 7 * weeks), to: addDays(range.to, 7 * weeks) }
}

export function weekCount(range: DateRange): number {
  const whole = toWholeWeeks(range)
  return (parse(whole.to) - parse(whole.from) + DAY_MS) / (7 * DAY_MS)
}

/** Why `range` can't be requested, or null if it can. Mirrors the API's 400s. */
export function rangeError(range: DateRange): string | null {
  if (!isValidDate(range.from)) return 'Choose a valid start date.'
  if (!isValidDate(range.to)) return 'Choose a valid end date.'
  if (range.to < range.from) return 'The end date must be on or after the start date.'
  if (weekCount(range) > MAX_RANGE_WEEKS) return `Choose at most ${MAX_RANGE_WEEKS} weeks.`
  return null
}

const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayMonthYear = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatDate(date: string, { withYear = false } = {}): string {
  return (withYear ? dayMonthYear : dayMonth).format(parse(date))
}
