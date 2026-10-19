package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

// maxWeeklyHours is every hour in a week. Anything above it is a typo.
const maxWeeklyHours = 168

type person struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	WeeklyHours float64 `json:"weeklyHours"`
}

const updateWeeklyHoursQuery = `
UPDATE people
SET weekly_hours = $2
WHERE id = $1
RETURNING id, name, weekly_hours::float8`

// handleUpdatePerson serves PATCH /api/people/{id} with a body of
// {"weeklyHours": number}. It returns the person as stored, which is all the
// grid needs: allocations don't depend on weekly hours.
func (s *server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	id, err := parsePersonID(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	hours, err := decodeWeeklyHours(http.MaxBytesReader(w, r.Body, 1<<10))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	var p person
	err = s.db.QueryRow(r.Context(), updateWeeklyHoursQuery, id, hours).Scan(&p.ID, &p.Name, &p.WeeklyHours)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, fmt.Sprintf("person %d not found", id))
		return
	}
	if err != nil {
		writeInternalError(w, r, fmt.Errorf("update person %d: %w", id, err))
		return
	}
	writeJSON(w, http.StatusOK, p)
}

// parsePersonID accepts a positive id that fits the people.id column (int4).
func parsePersonID(raw string) (int, error) {
	id, err := strconv.ParseInt(raw, 10, 32)
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("person id must be a positive integer, got %q", raw)
	}
	return int(id), nil
}

// decodeWeeklyHours reads {"weeklyHours": number} and checks the value is in
// [0, maxWeeklyHours]. Its errors are written for the API caller.
func decodeWeeklyHours(body io.Reader) (float64, error) {
	var req struct {
		WeeklyHours *float64 `json:"weeklyHours"`
	}
	dec := json.NewDecoder(body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		if typeErr, ok := errors.AsType[*json.UnmarshalTypeError](err); ok && typeErr.Field == "weeklyHours" {
			return 0, errors.New("weeklyHours must be a number")
		}
		return 0, errors.New(`body must be a JSON object like {"weeklyHours": 40}`)
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return 0, errors.New("body must hold a single JSON object")
	}
	if req.WeeklyHours == nil {
		return 0, errors.New("weeklyHours is required")
	}
	hours := *req.WeeklyHours
	if hours < 0 || hours > maxWeeklyHours {
		return 0, fmt.Errorf("weeklyHours must be between 0 and %d, got %v", maxWeeklyHours, hours)
	}
	return hours, nil
}
