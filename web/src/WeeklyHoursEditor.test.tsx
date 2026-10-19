import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapacityGrid } from './CapacityGrid'
import { capacityBody, jsonResponse, stubFetch } from './testing'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const ana = { id: 1, name: 'Ana Ferreira', weeklyHours: 40 }
const week = '2025-12-29'

async function renderLoadedGrid() {
  const fetch = stubFetch()
  const view = render(<CapacityGrid from="2025-12-29" to="2026-01-04" onRangeChange={() => {}} />)
  await act(async () => fetch.last().respond(jsonResponse(capacityBody([week], [ana], { 1: { [week]: 40 } }))))
  return { fetch, view }
}

function anaRow() {
  return screen.getByRole('row', { name: /Ana Ferreira/ })
}

function startEditing(value: string) {
  fireEvent.click(screen.getByRole('button', { name: /Edit weekly hours for Ana Ferreira/ }))
  fireEvent.change(screen.getByLabelText('Weekly hours for Ana Ferreira'), { target: { value } })
}

describe('editing weekly hours', () => {
  it('keeps the old capacity and the typed value when a save fails, and retry saves it', async () => {
    const { fetch } = await renderLoadedGrid()
    startEditing('30')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument()

    await act(async () => fetch.last().respond(jsonResponse({ error: 'internal error' }, 500)))

    expect(within(anaRow()).getByText('40 / 40')).toBeInTheDocument()
    expect(within(anaRow()).queryByText(/over/)).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent("Not saved. The server couldn't complete the request (error 500).")
    expect(screen.getByLabelText('Weekly hours for Ana Ferreira')).toHaveValue(30)

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    const patch = fetch.last()
    expect(patch.init?.method).toBe('PATCH')
    expect(patch.init?.body).toBe(JSON.stringify({ weeklyHours: 30 }))
    await act(async () => patch.respond(jsonResponse({ ...ana, weeklyHours: 30 })))

    expect(within(anaRow()).getByText('40 / 30')).toBeInTheDocument()
    expect(within(anaRow()).getByText(/10 h over/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /currently 30/ })).toHaveFocus()
  })

  it('sends one request however often Save is pressed while saving', async () => {
    const { fetch } = await renderLoadedGrid()
    startEditing('30')
    const callsBefore = fetch.calls.length
    const form = screen.getByLabelText('Weekly hours for Ana Ferreira').closest('form')
    if (!form) throw new Error('editor form not found')
    fireEvent.submit(form)
    fireEvent.submit(form)
    fireEvent.click(screen.getByRole('button', { name: 'Saving…' }))
    expect(fetch.calls.length).toBe(callsBefore + 1)
  })

  it('rejects out-of-range hours without calling the API', async () => {
    const { fetch } = await renderLoadedGrid()
    startEditing('200')
    const callsBefore = fetch.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Use 0 to 168 hours.')
    expect(fetch.calls.length).toBe(callsBefore)
  })

  it('cancels on Escape and returns focus to the edit button', async () => {
    await renderLoadedGrid()
    startEditing('30')
    fireEvent.keyDown(screen.getByLabelText('Weekly hours for Ana Ferreira'), { key: 'Escape' })
    expect(screen.queryByLabelText('Weekly hours for Ana Ferreira')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /currently 40/ })).toHaveFocus()
  })

  it('keeps the saved value when a range fetch that started before the save lands after it', async () => {
    const { fetch, view } = await renderLoadedGrid()
    startEditing('30')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const patch = fetch.last()

    // The manager moves on a week while the save is in flight.
    view.rerender(<CapacityGrid from="2026-01-05" to="2026-01-11" onRangeChange={() => {}} />)
    const rangeFetch = fetch.last()

    await act(async () => patch.respond(jsonResponse({ ...ana, weeklyHours: 30 })))
    // That fetch read the database before the update committed.
    await act(async () => rangeFetch.respond(jsonResponse(capacityBody(['2026-01-05'], [ana], { 1: { '2026-01-05': 32 } }))))

    expect(within(anaRow()).getByText('32 / 30')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /currently 30/ })).toBeInTheDocument()
  })
})

describe('API errors in the editor', () => {
  it('does not claim "not saved" when the save answered with something unreadable', async () => {
    const { fetch } = await renderLoadedGrid()
    startEditing('30')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await act(async () => fetch.last().respond(new Response('<html>proxy page</html>', { status: 200 })))
    expect(screen.getByRole('alert')).toHaveTextContent('may not have been saved; retry to make sure')
    expect(screen.getByRole('alert')).not.toHaveTextContent('Not saved.')
  })

  it('shows the server explanation for a rejected value', async () => {
    const { fetch } = await renderLoadedGrid()
    startEditing('30')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await act(async () => fetch.last().respond(jsonResponse({ error: 'person 1 not found' }, 404)))
    expect(screen.getByRole('alert')).toHaveTextContent('Not saved. person 1 not found')
  })
})
