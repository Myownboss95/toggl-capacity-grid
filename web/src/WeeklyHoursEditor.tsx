import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, errorMessage, updateWeeklyHours } from './api'
import type { Person } from './api'
import { MAX_WEEKLY_HOURS, formatHours, parseWeeklyHours } from './hours'

type Props = {
  person: Person
  onSaved: (person: Person) => void
}

type Edit =
  | { status: 'idle' }
  | { status: 'editing'; draft: string; error: string | null; saveFailed: boolean }
  | { status: 'saving'; draft: string }

// Saves are pessimistic: the grid only changes once the server confirms, and
// it shows the value the server stored. A failed save leaves the grid on the
// last confirmed hours and keeps the typed value here, with the error and a
// retry.
export function WeeklyHoursEditor({ person, onSaved }: Props) {
  const [edit, setEdit] = useState<Edit>({ status: 'idle' })
  const inFlight = useRef(false)
  const returnFocus = useRef(false)
  const inputId = useId()
  const errorId = useId()

  function close() {
    returnFocus.current = true
    setEdit({ status: 'idle' })
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (edit.status !== 'editing' || inFlight.current) return

    const parsed = parseWeeklyHours(edit.draft)
    if (!parsed.ok) {
      setEdit({ ...edit, error: parsed.error, saveFailed: false })
      return
    }
    if (parsed.hours === person.weeklyHours) {
      close()
      return
    }

    const { draft } = edit
    inFlight.current = true
    setEdit({ status: 'saving', draft })
    try {
      onSaved(await updateWeeklyHours(person.id, parsed.hours))
      close()
    } catch (error) {
      const unknownOutcome = error instanceof ApiError && error.kind === 'timeout'
      const message = unknownOutcome ? errorMessage(error) : `Not saved. ${errorMessage(error)}`
      setEdit({ status: 'editing', draft, error: message, saveFailed: true })
    } finally {
      inFlight.current = false
    }
  }

  if (edit.status === 'idle') {
    return (
      <button
        type="button"
        className="hours-button"
        ref={(button) => {
          if (button && returnFocus.current) {
            returnFocus.current = false
            button.focus()
          }
        }}
        onClick={() => setEdit({ status: 'editing', draft: String(person.weeklyHours), error: null, saveFailed: false })}
        aria-label={`Edit weekly hours for ${person.name}, currently ${formatHours(person.weeklyHours)}`}
      >
        {formatHours(person.weeklyHours)} h <span aria-hidden="true">✎</span>
      </button>
    )
  }

  const saving = edit.status === 'saving'
  const error = edit.status === 'editing' ? edit.error : null
  const retry = edit.status === 'editing' && edit.saveFailed

  return (
    <form className="hours-form" onSubmit={save} noValidate aria-busy={saving}>
      <label htmlFor={inputId} className="visually-hidden">
        Weekly hours for {person.name}
      </label>
      <input
        id={inputId}
        type="number"
        inputMode="decimal"
        min={0}
        max={MAX_WEEKLY_HOURS}
        step="any"
        autoFocus
        value={edit.draft}
        readOnly={saving}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => {
          if (edit.status === 'editing') setEdit({ ...edit, draft: e.target.value })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !saving) {
            e.preventDefault()
            close()
          }
        }}
      />
      <button type="submit" aria-disabled={saving}>
        {saving ? 'Saving…' : retry ? 'Retry' : 'Save'}
      </button>
      <button type="button" aria-disabled={saving} onClick={() => !saving && close()}>
        Cancel
      </button>
      {error && (
        <p id={errorId} className="row-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
