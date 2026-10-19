package main

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/jackc/pgx/v5"
)

const dateLayout = "2006-01-02"

// maxRangeWeeks caps one capacity request. The response grows with people ×
// weeks; at a few thousand people, 26 weeks is already ~100k cells, which is
// more than a manager can scan. Longer spans are paged by range.
const maxRangeWeeks = 26

// capacityResponse is the body of GET /api/capacity. Allocations are sparse,
// keyed by person id then week start: a missing entry means 0 hours.
type capacityResponse struct {
	From        string                     `json:"from"`
	To          string                     `json:"to"`
	Weeks       []week                     `json:"weeks"`
	People      []person                   `json:"people"`
	Allocations map[int]map[string]float64 `json:"allocations"`
}

type week struct {
	Start   string `json:"start"`
	ISOYear int    `json:"isoYear"`
	ISOWeek int    `json:"isoWeek"`
}

// dateRange is an inclusive span of calendar days (UTC midnight), widened to
// whole ISO weeks: from is always a Monday and to is always a Sunday.
type dateRange struct {
	from, to time.Time
}

const listPeopleQuery = `
SELECT id, name, weekly_hours::float8
FROM people
ORDER BY name, id`

// allocationsQuery expands each assignment that overlaps [$1, $2] into the
// days it covers inside the range, keeps Monday to Friday, and sums
// hours_per_day per person per ISO week. hours_per_day is literal hours and
// one allocation is split across several rows, so every row counts.
const allocationsQuery = `
SELECT a.person_id,
       date_trunc('week', d)::date AS week_start,
       sum(a.hours_per_day)::float8 AS hours
FROM assignments a
CROSS JOIN LATERAL generate_series(
       greatest(a.start_date, $1::date)::timestamp,
       least(a.end_date, $2::date)::timestamp,
       interval '1 day') AS d
WHERE a.start_date <= $2::date
  AND a.end_date >= $1::date
  AND extract(isodow FROM d) BETWEEN 1 AND 5
GROUP BY a.person_id, week_start
ORDER BY a.person_id, week_start`

// handleCapacity serves GET /api/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD.
// Both dates are inclusive and are widened to whole ISO weeks.
func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	rng, err := parseRange(r.URL.Query())
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	people, err := s.listPeople(r.Context())
	if err != nil {
		writeInternalError(w, r, err)
		return
	}
	allocations, err := s.allocations(r.Context(), rng)
	if err != nil {
		writeInternalError(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, capacityResponse{
		From:        rng.from.Format(dateLayout),
		To:          rng.to.Format(dateLayout),
		Weeks:       rng.weeks(),
		People:      people,
		Allocations: allocations,
	})
}

func (s *server) listPeople(ctx context.Context) ([]person, error) {
	rows, err := s.db.Query(ctx, listPeopleQuery)
	if err != nil {
		return nil, fmt.Errorf("query people: %w", err)
	}
	people, err := pgx.CollectRows(rows, pgx.RowToStructByPos[person])
	if err != nil {
		return nil, fmt.Errorf("read people: %w", err)
	}
	return people, nil
}

func (s *server) allocations(ctx context.Context, rng dateRange) (map[int]map[string]float64, error) {
	rows, err := s.db.Query(ctx, allocationsQuery, rng.from, rng.to)
	if err != nil {
		return nil, fmt.Errorf("query allocations: %w", err)
	}
	defer rows.Close()

	byPerson := make(map[int]map[string]float64)
	for rows.Next() {
		var (
			personID  int
			weekStart time.Time
			hours     float64
		)
		if err := rows.Scan(&personID, &weekStart, &hours); err != nil {
			return nil, fmt.Errorf("scan allocation: %w", err)
		}
		if byPerson[personID] == nil {
			byPerson[personID] = make(map[string]float64)
		}
		byPerson[personID][weekStart.Format(dateLayout)] = hours
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read allocations: %w", err)
	}
	return byPerson, nil
}

// parseRange reads the inclusive from/to query parameters and widens them to
// whole ISO weeks. Its errors are written for the API caller.
func parseRange(q url.Values) (dateRange, error) {
	from, err := parseDate("from", q.Get("from"))
	if err != nil {
		return dateRange{}, err
	}
	to, err := parseDate("to", q.Get("to"))
	if err != nil {
		return dateRange{}, err
	}
	if to.Before(from) {
		return dateRange{}, fmt.Errorf("to (%s) must be on or after from (%s)", to.Format(dateLayout), from.Format(dateLayout))
	}

	rng := dateRange{from: startOfISOWeek(from), to: startOfISOWeek(to).AddDate(0, 0, 6)}
	if rng.to.After(rng.from.AddDate(0, 0, 7*maxRangeWeeks)) {
		return dateRange{}, fmt.Errorf("range covers more than %d weeks; request at most %d weeks at a time", maxRangeWeeks, maxRangeWeeks)
	}
	return rng, nil
}

func parseDate(name, value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, fmt.Errorf("%s is required, as YYYY-MM-DD", name)
	}
	t, err := time.Parse(dateLayout, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("%s must be a valid date as YYYY-MM-DD, got %q", name, value)
	}
	return t, nil
}

// startOfISOWeek returns the Monday on or before t.
func startOfISOWeek(t time.Time) time.Time {
	daysSinceMonday := (int(t.Weekday()) + 6) % 7
	return t.AddDate(0, 0, -daysSinceMonday)
}

func (rng dateRange) weeks() []week {
	var weeks []week
	for d := rng.from; !d.After(rng.to); d = d.AddDate(0, 0, 7) {
		year, num := d.ISOWeek()
		weeks = append(weeks, week{Start: d.Format(dateLayout), ISOYear: year, ISOWeek: num})
	}
	return weeks
}
