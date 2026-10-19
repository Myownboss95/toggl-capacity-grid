# Worklog

Running notes on how this got built — decisions, assumptions, dead ends, and anything
left unfinished. Append as you go; a line or two per entry is right.

---

- Data: `hours_per_day` is literal hours per working day and every row is summed. Rows come in groups of 15 per (person, project, start, end): 14 × h + 1 × 2h = 16h, so a group totals 2/4/5/6/8 h/day. They are a split allocation, not duplicates.
- Data: deduping instead collapses everything to 3/16 of the summed value (team at 4.0% vs 21.5% of capacity for 2025-12-29..2026-01-18), and nobody is ever over. Summing gives Ana 40/40, Dee 45/40.
- Data: only Mon–Fri count. ~47k assignment rows end on a Sat/Sun; counting them would inflate weeks by 7/5. No holiday data, so 2026-01-01 counts as a working day (part of Ana's 40h in W1).
- Data: Eli Nakamura (id 5) has `weekly_hours = 0` and 20h allocated in W2. Shown as over-allocated; no ratio is ever computed, so no division by zero.
- Limitation: `weekly_hours` has no history, so editing it changes capacity for every past week too.
- API: `from`/`to` are inclusive calendar dates, widened to whole ISO weeks (Mon..Sun), so a week is never partially counted. `to < from` is a 400 even when both fall in the same week.
- API: range capped at 26 weeks. Response size is people × weeks; at a few thousand people that's ~100k cells, past what a manager scans. Longer views page by range.
- API: allocations are sparse (`allocations[personId][weekStart]`, missing = 0) and numbers are `float8`. Every seed value is a multiple of 1/16, so floats are exact.
- Query: per-day `generate_series` clipped to the range, ISODOW 1–5, bucketed by `date_trunc('week')`. EXPLAIN for 26 weeks: seq scan of 38k overlapping rows → 263k days → 4k cells, 60–120 ms.
- Deferred: the `(start_date, end_date)` btree can't serve an overlap predicate (only the `start_date <=` half). Production wants a GiST index on `daterange(start_date, end_date, '[]')`; the schema is fixed here.
- Verified: API returns Ana 40/–/30, Dee –/45/40, Eli –/20/– for W1–W3 2026, matching a hand reading of their assignment rows. Bad dates, inverted and >26-week ranges return 400 JSON errors.
- Data: people 1–5 (Ana, Bo, Cem, Dee, Eli) only have assignments in 2025-12-29..2026-01-16; outside W1–W3 2026 they're all zeros, which is correct.
- UI: range state lives in `App`, not the grid, because the overview page's timeline will share it. It's mirrored to `?from=&to=` with `replaceState` (no history entry per click); the grid gets `from`/`to` + `onRangeChange` and renders the controls.
- UI: the date inputs are a draft applied with a button, so a half-typed date never fires a request; client checks mirror the API's 400s. Prev/next keep the span.
- UI: out-of-order guard is two layers: each range aborts the previous request (cancelling its query via `r.Context()`), and the reducer drops any response whose request id isn't the latest.
- UI: previous data stays on screen dimmed (`aria-busy`) while the next range loads or if it fails; the failure banner says which range is shown instead and offers retry. Skeleton only on first load.
- Verified: 8 prev/next clicks 40 ms apart in the browser land on the right range (W6–W8), headers and cells agree, grid un-dims. Not covered: 5 `click()`s in one JS task shift once (each reads the same render's range); real clicks are separate tasks, so left as is.
- Verified: time-zone test is meaningful — Node honours a runtime `TZ` change (`new Date('2026-01-01').getDate()` is 31 in LA), so a local-time implementation would fail it.
