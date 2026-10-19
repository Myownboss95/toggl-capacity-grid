import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapacityGrid } from './CapacityGrid'
import { capacityBody, jsonResponse, stubFetch } from './testing'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const ana = { id: 1, name: 'Ana Ferreira', weeklyHours: 40 }
const eli = { id: 5, name: 'Eli Nakamura', weeklyHours: 0 }

describe('CapacityGrid', () => {
  it('shows the last range asked for when responses arrive out of order', async () => {
    const fetch = stubFetch()
    const { rerender } = render(<CapacityGrid from="2025-12-29" to="2026-01-04" onRangeChange={() => {}} />)
    const first = fetch.last()

    rerender(<CapacityGrid from="2026-01-05" to="2026-01-11" onRangeChange={() => {}} />)
    const second = fetch.last()
    expect(second).not.toBe(first)

    await act(async () => second.respond(jsonResponse(capacityBody(['2026-01-05'], [ana], { 1: { '2026-01-05': 8 } }))))
    // The first response was already on the wire when the user moved on.
    await act(async () => first.respond(jsonResponse(capacityBody(['2025-12-29'], [ana], { 1: { '2025-12-29': 40 } }))))

    const row = screen.getByRole('row', { name: /Ana Ferreira/ })
    expect(within(row).getByText('8 / 40')).toBeInTheDocument()
    expect(within(row).queryByText('40 / 40')).not.toBeInTheDocument()
  })

  it('aborts the request for a range the user has left', () => {
    const fetch = stubFetch()
    const { rerender } = render(<CapacityGrid from="2025-12-29" to="2026-01-04" onRangeChange={() => {}} />)
    const first = fetch.last()
    rerender(<CapacityGrid from="2026-01-05" to="2026-01-11" onRangeChange={() => {}} />)
    expect(first.init?.signal?.aborted).toBe(true)
  })

  it('flags a zero-capacity person with allocated hours as over, without dividing by zero', async () => {
    const fetch = stubFetch()
    render(<CapacityGrid from="2026-01-05" to="2026-01-11" onRangeChange={() => {}} />)
    await act(async () => fetch.last().respond(jsonResponse(capacityBody(['2026-01-05'], [eli], { 5: { '2026-01-05': 20 } }))))

    const row = screen.getByRole('row', { name: /Eli Nakamura/ })
    expect(within(row).getByText('20 / 0')).toBeInTheDocument()
    expect(within(row).getByText(/20 h over/)).toBeInTheDocument()
    expect(row).not.toHaveTextContent(/NaN|Infinity/)
  })

  it('shows an error with a retry when the first load fails', async () => {
    const fetch = stubFetch()
    render(<CapacityGrid from="2026-01-05" to="2026-01-11" onRangeChange={() => {}} />)
    await act(async () => fetch.last().respond(jsonResponse({ error: 'internal error' }, 500)))

    expect(screen.getByText(/Couldn't load/)).toHaveTextContent('(error 500)')
    act(() => screen.getByRole('button', { name: 'Try again' }).click())
    await act(async () => fetch.last().respond(jsonResponse(capacityBody(['2026-01-05'], [ana]))))
    expect(screen.getByRole('row', { name: /Ana Ferreira/ })).toHaveTextContent('0 / 40')
  })
})
