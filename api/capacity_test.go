package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"testing"
)

func TestParseRange(t *testing.T) {
	tests := []struct {
		name     string
		from, to string
		wantFrom string
		wantTo   string
		wantErr  string
	}{
		{name: "already whole weeks", from: "2025-12-29", to: "2026-01-18", wantFrom: "2025-12-29", wantTo: "2026-01-18"},
		{name: "snaps outward across the year boundary", from: "2026-01-01", to: "2026-01-16", wantFrom: "2025-12-29", wantTo: "2026-01-18"},
		{name: "sunday snaps back to its own monday", from: "2026-01-04", to: "2026-01-04", wantFrom: "2025-12-29", wantTo: "2026-01-04"},
		{name: "single day", from: "2026-01-07", to: "2026-01-07", wantFrom: "2026-01-05", wantTo: "2026-01-11"},
		{name: "exactly the maximum", from: "2026-01-05", to: "2026-07-05", wantFrom: "2026-01-05", wantTo: "2026-07-05"},
		{name: "one week over the maximum", from: "2026-01-05", to: "2026-07-06", wantErr: "more than 26 weeks"},
		{name: "missing from", to: "2026-01-04", wantErr: "from is required"},
		{name: "missing to", from: "2026-01-04", wantErr: "to is required"},
		{name: "unpadded date", from: "2026-1-5", to: "2026-01-11", wantErr: "from must be a valid date"},
		{name: "impossible date", from: "2026-01-05", to: "2026-02-30", wantErr: "to must be a valid date"},
		{name: "timestamp instead of date", from: "2026-01-05T00:00:00Z", to: "2026-01-11", wantErr: "from must be a valid date"},
		{name: "to before from", from: "2026-01-09", to: "2026-01-08", wantErr: "to (2026-01-08) must be on or after from (2026-01-09)"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			q := url.Values{}
			if tt.from != "" {
				q.Set("from", tt.from)
			}
			if tt.to != "" {
				q.Set("to", tt.to)
			}
			rng, err := parseRange(q)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("parseRange(%q, %q) error = %v; want it to contain %q", tt.from, tt.to, err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseRange(%q, %q) unexpected error: %v", tt.from, tt.to, err)
			}
			gotFrom, gotTo := rng.from.Format(dateLayout), rng.to.Format(dateLayout)
			if gotFrom != tt.wantFrom || gotTo != tt.wantTo {
				t.Errorf("parseRange(%q, %q) = %s..%s; want %s..%s", tt.from, tt.to, gotFrom, gotTo, tt.wantFrom, tt.wantTo)
			}
		})
	}
}

func TestDateRangeWeeks(t *testing.T) {
	tests := []struct {
		name     string
		from, to string
		want     []week
	}{
		{
			name: "week 1 of 2026 starts in 2025",
			from: "2025-12-29", to: "2026-01-11",
			want: []week{{"2025-12-29", 2026, 1}, {"2026-01-05", 2026, 2}},
		},
		{
			name: "2026 has 53 ISO weeks",
			from: "2026-12-28", to: "2027-01-10",
			want: []week{{"2026-12-28", 2026, 53}, {"2027-01-04", 2027, 1}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rng, err := parseRange(url.Values{"from": {tt.from}, "to": {tt.to}})
			if err != nil {
				t.Fatalf("parseRange(%q, %q) unexpected error: %v", tt.from, tt.to, err)
			}
			if got := rng.weeks(); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("weeks(%s..%s) = %v; want %v", tt.from, tt.to, got, tt.want)
			}
		})
	}
}

// The server has no database here: a bad range must be rejected before any
// query runs.
func TestHandleCapacityRejectsBadRange(t *testing.T) {
	s := &server{}
	req := httptest.NewRequest(http.MethodGet, "/api/capacity?from=2026-01-09&to=2026-01-08", nil)
	rec := httptest.NewRecorder()

	s.handleCapacity(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d; want %d", rec.Code, http.StatusBadRequest)
	}
	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if !strings.Contains(body["error"], "must be on or after") {
		t.Errorf("error = %q; want it to explain the inverted range", body["error"])
	}
}
