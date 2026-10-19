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

describe('capacityReducer: saves racing range fetches', () => {
  const saved = { id: 1, name: 'Ana', weeklyHours: 30 }

  it('does not let a fetch that started before the save overwrite the saved hours', () => {
    const state = run(
      { type: 'fetchStarted', requestId: 1 },
      { type: 'fetchSucceeded', requestId: 1, data: dataFor('A') },
      { type: 'fetchStarted', requestId: 2 }, // user moves to the next week
      { type: 'personSaved', person: saved, savedAt: 3 }, // save confirmed while that fetch is out
      { type: 'fetchSucceeded', requestId: 2, data: dataFor('B') }, // read the old 40 before the save
    )
    expect(state.request.data?.people[0]?.weeklyHours).toBe(30)
  })

  it('applies the save to the data on screen straight away', () => {
    const state = run(
      { type: 'fetchStarted', requestId: 1 },
      { type: 'fetchSucceeded', requestId: 1, data: dataFor('A') },
      { type: 'personSaved', person: saved, savedAt: 2 },
    )
    expect(state.request).toMatchObject({ status: 'success', data: { people: [{ weeklyHours: 30 }] } })
  })

  it('trusts a fetch that started after the save, even if the value moved on', () => {
    const later = { ...dataFor('B'), people: [{ id: 1, name: 'Ana', weeklyHours: 36 }] }
    const state = run(
      { type: 'fetchStarted', requestId: 1 },
      { type: 'personSaved', person: saved, savedAt: 2 },
      { type: 'fetchStarted', requestId: 3 },
      { type: 'fetchSucceeded', requestId: 3, data: later },
    )
    expect(state.request.data?.people[0]?.weeklyHours).toBe(36)
  })
})
