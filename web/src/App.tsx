import { useState } from 'react'
import { CapacityGrid } from './CapacityGrid'
import { rangeError, toWholeWeeks } from './dates'
import type { DateRange } from './dates'

// ISO weeks 1–3 of 2026.
const DEFAULT_RANGE: DateRange = { from: '2025-12-29', to: '2026-01-18' }

// The range lives here, not in the grid, because the team overview page will
// share it with the logged-time timeline. It is mirrored into ?from=&to= so a
// reload or a shared link opens the same weeks.
export function App() {
  const [range, setRange] = useState(rangeFromUrl)

  function changeRange(next: DateRange) {
    setRange(next)
    const url = new URL(window.location.href)
    url.searchParams.set('from', next.from)
    url.searchParams.set('to', next.to)
    window.history.replaceState(null, '', url)
  }

  return (
    <main>
      <h1>Team capacity</h1>
      <CapacityGrid from={range.from} to={range.to} onRangeChange={changeRange} />
    </main>
  )
}

function rangeFromUrl(): DateRange {
  const params = new URLSearchParams(window.location.search)
  const range = { from: params.get('from') ?? '', to: params.get('to') ?? '' }
  return rangeError(range) === null ? toWholeWeeks(range) : DEFAULT_RANGE
}
