import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { errorMessage, fetchCapacity } from './api'
import type { Person } from './api'
import { capacityReducer, initialCapacityState } from './capacityState'

/**
 * Loads GET /api/capacity for [from, to]. A new range aborts the request in
 * flight, and the reducer drops any response that isn't for the latest
 * request, so fast prev/next clicks always end on the last range asked for.
 *
 * personSaved applies a successful PATCH to the loaded data. Allocations
 * don't depend on weekly hours, so swapping in the saved person is exact.
 */
export function useCapacity(from: string, to: string) {
  const [state, dispatch] = useReducer(capacityReducer, initialCapacityState)
  // One counter orders fetch starts and save completions against each other.
  const clock = useRef(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const requestId = ++clock.current
    dispatch({ type: 'fetchStarted', requestId })
    fetchCapacity({ from, to }, controller.signal).then(
      (data) => dispatch({ type: 'fetchSucceeded', requestId, data }),
      (error: unknown) => {
        if (controller.signal.aborted) return
        dispatch({ type: 'fetchFailed', requestId, error: errorMessage(error) })
      },
    )
    return () => controller.abort()
  }, [from, to, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const personSaved = useCallback((person: Person) => {
    dispatch({ type: 'personSaved', person, savedAt: ++clock.current })
  }, [])

  return { request: state.request, retry, personSaved }
}
