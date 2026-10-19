import type { CapacityData } from './api'

/**
 * The grid's server state. `data` survives a new request so the previous
 * range stays on screen (dimmed) while the next one loads or if it fails.
 */
export type RequestState =
  | { status: 'loading'; data: CapacityData | null }
  | { status: 'success'; data: CapacityData }
  | { status: 'error'; error: string; data: CapacityData | null }

export type CapacityState = {
  request: RequestState
  /** Only the response to this request may land; older ones arrived late. */
  latestRequestId: number
}

export type CapacityAction =
  | { type: 'fetchStarted'; requestId: number }
  | { type: 'fetchSucceeded'; requestId: number; data: CapacityData }
  | { type: 'fetchFailed'; requestId: number; error: string }

export const initialCapacityState: CapacityState = {
  request: { status: 'loading', data: null },
  latestRequestId: 0,
}

export function capacityReducer(state: CapacityState, action: CapacityAction): CapacityState {
  switch (action.type) {
    case 'fetchStarted':
      return {
        ...state,
        latestRequestId: action.requestId,
        request: { status: 'loading', data: state.request.data },
      }
    case 'fetchSucceeded':
      if (action.requestId !== state.latestRequestId) return state
      return { ...state, request: { status: 'success', data: action.data } }
    case 'fetchFailed':
      if (action.requestId !== state.latestRequestId) return state
      return { ...state, request: { status: 'error', error: action.error, data: state.request.data } }
    default:
      return assertNever(action)
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled action: ${JSON.stringify(value)}`)
}
