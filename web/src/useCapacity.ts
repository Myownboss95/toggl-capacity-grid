import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { errorMessage, fetchCapacity } from './api'
import { capacityReducer, initialCapacityState } from './capacityState'

/**
 * Loads GET /api/capacity for [from, to]. A new range aborts the request in
 * flight, and the reducer drops any response that isn't for the latest
 * request, so fast prev/next clicks always end on the last range asked for.
 */
export function useCapacity(from: string, to: string) {
  const [state, dispatch] = useReducer(capacityReducer, initialCapacityState)
  const lastRequestId = useRef(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const requestId = ++lastRequestId.current
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

  return { request: state.request, retry }
}
