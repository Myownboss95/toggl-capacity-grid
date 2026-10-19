import { memo } from 'react'
import { cellKey } from './api'
import type { CapacityData, Person, Week } from './api'
import { formatDate } from './dates'
import type { DateRange } from './dates'
import { formatHours } from './hours'
import { RangeControls } from './RangeControls'
import { useCapacity } from './useCapacity'
import { WeeklyHoursEditor } from './WeeklyHoursEditor'

type Props = {
  from: string
  to: string
  onRangeChange: (range: DateRange) => void
}

// CapacityGrid renders one row per person and one column per ISO week, showing
// allocated / capacity hours per cell and flagging over-allocation with an
// icon and text as well as colour.
export function CapacityGrid({ from, to, onRangeChange }: Props) {
  const { request, retry, personSaved } = useCapacity(from, to)
  const { data } = request
  const requested = `${formatDate(from, { withYear: true })} – ${formatDate(to, { withYear: true })}`

  return (
    <section className="capacity" aria-busy={request.status === 'loading'}>
      <RangeControls range={{ from, to }} onChange={onRangeChange} />

      <div className="status" role="status">
        {request.status === 'loading' && data && <span>Loading {requested}…</span>}
      </div>
      {request.status === 'error' && (
        <div className="load-error" role="alert">
          <p>
            Couldn't load {requested}. {request.error}
            {data && ` Showing ${formatDate(data.from)} – ${formatDate(data.to)} instead.`}
          </p>
          <button type="button" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {data === null ? (
        request.status === 'loading' && <GridSkeleton />
      ) : data.people.length === 0 ? (
        <p className="empty">No people on this team yet.</p>
      ) : (
        <Grid data={data} stale={request.status !== 'success'} onSaved={personSaved} />
      )}
    </section>
  )
}

function Grid({ data, stale, onSaved }: { data: CapacityData; stale: boolean; onSaved: (person: Person) => void }) {
  return (
    <div className="grid-scroll">
      <table className={stale ? 'grid is-stale' : 'grid'}>
        <caption>
          Allocated / capacity hours per person and ISO week, {formatDate(data.from, { withYear: true })} –{' '}
          {formatDate(data.to, { withYear: true })}. Weeks over capacity are marked ⚠.
        </caption>
        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col">Weekly hours</th>
            {data.weeks.map((week) => (
              <th scope="col" key={week.start} className="week-head">
                <abbr title={`ISO week ${week.isoWeek} of ${week.isoYear}`}>W{week.isoWeek}</abbr>
                <span className="week-date">{formatDate(week.start)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.people.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              weeks={data.weeks}
              allocations={data.allocations}
              onSaved={onSaved}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

type RowProps = {
  person: Person
  weeks: Week[]
  allocations: ReadonlyMap<string, number>
  onSaved: (person: Person) => void
}

const PersonRow = memo(function PersonRow({ person, weeks, allocations, onSaved }: RowProps) {
  return (
    <tr>
      <th scope="row">{person.name}</th>
      <td className="capacity-cell">
        <WeeklyHoursEditor person={person} onSaved={onSaved} />
      </td>
      {weeks.map((week) => (
        <WeekCell
          key={week.start}
          allocated={allocations.get(cellKey(person.id, week.start)) ?? 0}
          capacity={person.weeklyHours}
        />
      ))}
    </tr>
  )
})

function WeekCell({ allocated, capacity }: { allocated: number; capacity: number }) {
  const over = allocated > capacity
  return (
    <td className={over ? 'cell is-over' : allocated === 0 ? 'cell is-free' : 'cell'}>
      <span className="cell-hours">
        {formatHours(allocated)} / {formatHours(capacity)}
      </span>
      {over && <span className="cell-flag">⚠ {formatHours(allocated - capacity)} h over</span>}
    </td>
  )
}

function GridSkeleton() {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: 8 }, (_, row) => (
        <div className="skeleton-row" key={row}>
          {Array.from({ length: 5 }, (_, col) => (
            <span className="skeleton-cell" key={col} />
          ))}
        </div>
      ))}
      <span className="visually-hidden">Loading capacity…</span>
    </div>
  )
}
