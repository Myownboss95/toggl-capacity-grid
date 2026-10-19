package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDecodeWeeklyHours(t *testing.T) {
	tests := []struct {
		body    string
		want    float64
		wantErr string
	}{
		{body: `{"weeklyHours": 40}`, want: 40},
		{body: `{"weeklyHours": 0}`, want: 0},
		{body: `{"weeklyHours": 37.5}`, want: 37.5},
		{body: `{"weeklyHours": 168}`, want: 168},
		{body: `{"weeklyHours": 168.5}`, wantErr: "between 0 and 168"},
		{body: `{"weeklyHours": -1}`, wantErr: "between 0 and 168"},
		{body: `{}`, wantErr: "weeklyHours is required"},
		{body: `{"weeklyHours": null}`, wantErr: "weeklyHours is required"},
		{body: `{"weeklyHours": "40"}`, wantErr: "must be a number"},
		{body: `{"weeklyHours": NaN}`, wantErr: "must be a JSON object"},
		{body: `{"weeklyHours": 1e400}`, wantErr: "must be a number"},
		{body: `{"weekly_hours": 40}`, wantErr: "must be a JSON object"},
		{body: `{"weeklyHours": 40} {"weeklyHours": 50}`, wantErr: "single JSON object"},
		{body: `[40]`, wantErr: "must be a JSON object"},
		{body: ``, wantErr: "must be a JSON object"},
	}
	for _, tt := range tests {
		t.Run(tt.body, func(t *testing.T) {
			got, err := decodeWeeklyHours(strings.NewReader(tt.body))
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("decodeWeeklyHours(%s) error = %v; want it to contain %q", tt.body, err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("decodeWeeklyHours(%s) unexpected error: %v", tt.body, err)
			}
			if got != tt.want {
				t.Errorf("decodeWeeklyHours(%s) = %v; want %v", tt.body, got, tt.want)
			}
		})
	}
}

// The server has no database here: bad input must be rejected before any
// query runs.
func TestHandleUpdatePersonRejectsBadInput(t *testing.T) {
	tests := []struct {
		id, body string
	}{
		{id: "abc", body: `{"weeklyHours": 40}`},
		{id: "0", body: `{"weeklyHours": 40}`},
		{id: "-3", body: `{"weeklyHours": 40}`},
		{id: "99999999999", body: `{"weeklyHours": 40}`},
		{id: "1", body: `{"weeklyHours": -5}`},
		{id: "1", body: strings.Repeat(" ", 2<<10) + `{"weeklyHours": 40}`},
	}
	for _, tt := range tests {
		t.Run(tt.id, func(t *testing.T) {
			s := &server{}
			req := httptest.NewRequest(http.MethodPatch, "/api/people/"+tt.id, strings.NewReader(tt.body))
			req.SetPathValue("id", tt.id)
			rec := httptest.NewRecorder()

			s.handleUpdatePerson(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Fatalf("PATCH id=%q body=%.40q: status = %d; want %d", tt.id, tt.body, rec.Code, http.StatusBadRequest)
			}
			var body map[string]string
			if err := json.NewDecoder(rec.Body).Decode(&body); err != nil || body["error"] == "" {
				t.Errorf("PATCH id=%q: body = %v (decode err %v); want a JSON error", tt.id, body, err)
			}
		})
	}
}
