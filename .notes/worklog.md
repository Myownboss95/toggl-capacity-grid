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
