import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { formatDate, rangeError, shiftWeeks, toWholeWeeks, weekCount } from './dates'
import type { DateRange } from './dates'

type Props = {
  range: DateRange
  onChange: (range: DateRange) => void
}

export function RangeControls({ range, onChange }: Props) {
  const weeks = weekCount(range)
  return (
    <div className="range-controls">
      <div className="range-nav" role="group" aria-label="Move the range by one week">
        <button type="button" onClick={() => onChange(shiftWeeks(range, -1))}>
          ← Previous week
        </button>
        <button type="button" onClick={() => onChange(shiftWeeks(range, 1))}>
          Next week →
        </button>
      </div>
      {/* Keyed by range so the inputs reset when prev/next moves it. */}
      <RangeForm key={`${range.from}:${range.to}`} range={range} onApply={onChange} />
      <p className="range-summary">
        {formatDate(range.from, { withYear: true })} – {formatDate(range.to, { withYear: true })} ·{' '}
        {weeks} {weeks === 1 ? 'week' : 'weeks'}
      </p>
    </div>
  )
}

// The inputs are a draft until applied, so a half-typed date never fires a
// request.
function RangeForm({ range, onApply }: { range: DateRange; onApply: (range: DateRange) => void }) {
  const [draft, setDraft] = useState(range)
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const problem = rangeError(draft)
    setError(problem)
    if (problem === null) onApply(toWholeWeeks(draft))
  }

  return (
    <form className="range-form" onSubmit={submit} noValidate>
      <label>
        From
        <input
          type="date"
          value={draft.from}
          onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
        />
      </label>
      <label>
        To
        <input
          type="date"
          value={draft.to}
          onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
        />
      </label>
      <button type="submit">Show range</button>
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
