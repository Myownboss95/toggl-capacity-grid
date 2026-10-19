# Decisions

## What did the spec not tell you?

- **`hours_per_day`** is literal hours per working day, and every row is summed. Rows come in
  groups of 15 (14 × *h* plus 1 × *2h*) that each total a round 2–8 h/day: one allocation split
  into parts, not duplicates (see below).
- **Working days:** Monday to Friday only. 37% of assignments end on a weekend, which would
  inflate full weeks by 7/5. There's no holiday data, so 1 January counts.
- **Weeks:** ISO weeks, Monday start. Assignments are split by day, so one that crosses a
  weekend lands in two weeks. 2025-12-29 is W1 2026 and 2026 has a W53; both are tested.
- **Range:** `from`/`to` are inclusive, widened to whole weeks, at most 26 weeks (a few thousand
  people × 26 weeks is ~100k cells). Bad input is a 400 that says what to fix.
- **JSON shape:** one call. The server owns the week list, so both ends bucket the same way.
  Allocations are sparse (missing = 0), and hours are exact floats (multiples of 1/16).
  ```json
  { "from": "2025-12-29", "to": "2026-01-18",
    "weeks":  [{ "start": "2025-12-29", "isoYear": 2026, "isoWeek": 1 }],
    "people": [{ "id": 1, "name": "Ana Ferreira", "weeklyHours": 40 }],
    "allocations": { "1": { "2025-12-29": 40, "2026-01-12": 30 } } }
  ```
- **After a save:** pessimistic. Wait for the 200, then swap in the person the server returned.
  Allocations don't depend on `weekly_hours`, so that's exact: no refetch, and no flag that
  flashes "over" and rolls back. On failure the cells keep the last confirmed value and the
  input keeps what was typed, with Retry. A range fetch that started before the save can't
  overwrite it.
- **Deferred for scale:** rendering breaks first (~0.6 s for 13,000 cells at 500 people, while the
  API takes ~0.1 s), so rows need virtualising and people need server paging. The overlap query
  needs a GiST index on `daterange(start_date, end_date, '[]')`; the schema is fixed.

## What did you notice that looked wrong?

- **The repeated rows.** In each 15-row group, 14 rows are identical: 93% of all rows. A
  full-row `DISTINCT` would delete 109,369 of 126,195 (87%). But every group sums to a round
  2–8 h/day. Deduplicating leaves busy weeks at ~13% utilised instead of 67%, and over-allocated
  weeks drop from 483 to 1 (Jan–Jul 2026). *Left as data; summed.*
- **`hours_per_day` is tiny** (0.125–1.0); it only makes sense per group. *Left; read literally.*
- **Weekend end dates:** 46,665 assignments (37%). *Handled: weekdays only.*
- **Eli Nakamura:** 0 weekly hours, 20 h allocated. *Left;* shown as "20 / 0 ⚠ 20 h over",
  with no division by zero.
- **No `weekly_hours` history:** an edit rewrites every past week. *Left: needs a schema change.*
- Every API cell matches an independent SQL query: 510/510 for W1–W3 2026, 4,083/4,083 over
  26 weeks.

## What did the AI get wrong that you caught?

- The agent's first save-failure handling showed "Not saved. The server answered 502", which
  means nothing to a manager. Saves also had no timeout while Cancel was disabled, so a server
  that hung would leave the row on "Saving…" for good. The unit tests passed: they only used a
  tidy 500 with a JSON error. It surfaced in a check I required before calling it done: stop the
  API and look at what a manager actually sees. Now a 5xx gets a plain message with Retry, and a
  save times out after 15 s with "may not have been saved". Retry is safe because PATCH sets an
  absolute value.

## What would you do differently with a week?

In priority order:

1. Capacity history with effective dates: an edit silently changes past weeks today, and it
   changes the PATCH contract, so do it before anything builds on it.
2. Row virtualisation and server paging: rendering breaks first (~0.6 s at 500 people, growing
   with every row).
3. GiST index on the assignment date range: two years of history makes the seq scan expensive;
   it pairs with paging.
4. Holidays and time off: short weeks shouldn't show as spare capacity, and that's when
   over-commitment hides.
5. Concurrency control on edits (version/ETag, 409 on conflict): today the last write silently
   wins.
6. Browser tests for the edit flow: keyboard, focus and failure states, which jsdom only partly
   covers.
