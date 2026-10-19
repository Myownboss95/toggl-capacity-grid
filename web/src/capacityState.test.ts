import { describe, expect, it } from 'vitest'
import type { CapacityData } from './api'
import { capacityReducer, initialCapacityState } from './capacityState'
import type { CapacityAction, CapacityState } from './capacityState'

function dataFor(from: string): CapacityData {
  return { from, to: from, weeks: [], people: [{ id: 1, name: 'Ana', weeklyHours: 40 }], allocations: new Map() }
}

function run(...actions: CapacityAction[]): CapacityState {
  return actions.reduce(capacityReducer, initialCapacityState)
}

describe('capacityReducer: out-of-order responses', () => {
  it('ignores a response that lands after a newer request started', () => {
    const state = run(
      { type: 'fetchStarted', requestId: 1 },
      { type: 'fetchStarted', requestId: 2 },
      { type: 'fetchSucceeded', requestId: 2, data: dataFor('2026-01-05') },
      { type: 'fetchSucceeded', requestId: 1, data: dataFor('2025-12-29') },
    )
    expect(state.request).toMatchObject({ status: 'success', data: { from: '2026-01-05' } })
  })

  it('ignores a failure from a request that was superseded', () => {
    const state = run(
      { type: 'fetchStarted', requestId: 1 },
      { type: 'fetchStarted', requestId: 2 },
      { type: 'fetchSucceeded', requestId: 2, data: dataFor('2026-01-05') },
      { type: 'fetchFailed', requestId: 1, error: 'boom' },
    )
    expect(state.request.status).toBe('success')
  })

  it('keeps the previous range on screen while the next loads, and if it fails', () => {
    const loaded = run({ type: 'fetchStarted', requestId: 1 }, { type: 'fetchSucceeded', requestId: 1, data: dataFor('A') })
    const loading = capacityReducer(loaded, { type: 'fetchStarted', requestId: 2 })
    expect(loading.request).toMatchObject({ status: 'loading', data: { from: 'A' } })
    const failed = capacityReducer(loading, { type: 'fetchFailed', requestId: 2, error: 'offline' })
    expect(failed.request).toMatchObject({ status: 'error', error: 'offline', data: { from: 'A' } })
  })
})
