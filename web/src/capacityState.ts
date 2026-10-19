import type { CapacityData, Person } from './api'

/**
 * The grid's server state. `data` survives a new request so the previous
 * range stays on screen (dimmed) while the next one loads or if it fails.
 */
export type RequestState =
  | { status: 'loading'; data: CapacityData | null }
  | { status: 'success'; data: CapacityData }
  | { status: 'error'; error: string; data: CapacityData | null }

// Request ids and save times come from one counter (see useCapacity), so
// "this fetch started before that save finished" is a plain comparison.
type SavedHours = { weeklyHours: number; savedAt: number }

export type CapacityState = {
  request: RequestState
  /** Only the response to this request may land; older ones arrived late. */
  latestRequestId: number
  /** Weekly hours confirmed by a save. They beat any fetch that started before the save finished. */
  saved: ReadonlyMap<number, SavedHours>
}

export type CapacityAction =
  | { type: 'fetchStarted'; requestId: number }
  | { type: 'fetchSucceeded'; requestId: number; data: CapacityData }
  | { type: 'fetchFailed'; requestId: number; error: string }
  | { type: 'personSaved'; person: Person; savedAt: number }

export const initialCapacityState: CapacityState = {
  request: { status: 'loading', data: null },
  latestRequestId: 0,
  saved: new Map(),
}

export function capacityReducer(state: CapacityState, action: CapacityAction): CapacityState {
  switch (action.type) {
    case 'fetchStarted':
      return {
        ...state,
        latestRequestId: action.requestId,
        request: { status: 'loading', data: state.request.data },
      }
    case 'fetchSucceeded': {
      if (action.requestId !== state.latestRequestId) return state
      const data = withSavedHours(action.data, state.saved, action.requestId)
      return { ...state, request: { status: 'success', data } }
    }
    case 'fetchFailed':
      if (action.requestId !== state.latestRequestId) return state
      return { ...state, request: { status: 'error', error: action.error, data: state.request.data } }
    case 'personSaved': {
      const { person, savedAt } = action
      const saved = new Map(state.saved).set(person.id, { weeklyHours: person.weeklyHours, savedAt })
      return { ...state, saved, request: replacePerson(state.request, person) }
    }
    default:
      return assertNever(action)
  }
}

// A fetch that started before a save finished may have read the old weekly
// hours; the saved value wins. A fetch that started later reads the database
// after the save committed, so its value (even someone else's newer edit)
// stands.
function withSavedHours(data: CapacityData, saved: CapacityState['saved'], requestId: number): CapacityData {
  const people = data.people.map((person) => {
    const confirmed = saved.get(person.id)
    return confirmed && confirmed.savedAt > requestId ? { ...person, weeklyHours: confirmed.weeklyHours } : person
  })
  return { ...data, people }
}

function replacePerson(request: RequestState, person: Person): RequestState {
  const swap = (data: CapacityData): CapacityData => ({
    ...data,
    people: data.people.map((p) => (p.id === person.id ? person : p)),
  })
  switch (request.status) {
    case 'success':
      return { ...request, data: swap(request.data) }
    case 'loading':
    case 'error':
      return { ...request, data: request.data && swap(request.data) }
    default:
      return assertNever(request)
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled action: ${JSON.stringify(value)}`)
}
