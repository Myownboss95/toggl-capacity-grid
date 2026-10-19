package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type server struct {
	db *pgxpool.Pool
}

func main() {
	ctx := context.Background()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://capacity:capacity@localhost:5432/capacity?sslmode=disable"
	}

	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer db.Close()

	for i := 0; i < 30; i++ {
		if err = db.Ping(ctx); err == nil {
			break
		}
		time.Sleep(time.Second)
	}
	if err != nil {
		log.Fatalf("ping: %v", err)
	}

	s := &server{db: db}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/capacity", s.handleCapacity)
	mux.HandleFunc("PATCH /api/people/{id}", s.handleUpdatePerson)

	log.Println("listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	var people int
	if err := s.db.QueryRow(r.Context(), `SELECT count(*) FROM people`).Scan(&people); err != nil {
		writeInternalError(w, r, fmt.Errorf("count people: %w", err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "people": people})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// writeError sends the API's one error shape: {"error": "..."}.
func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// writeInternalError logs err and sends a generic 500, so driver and SQL
// details never reach the client. A request the client already cancelled
// (for example by paging to another week) is not logged.
func writeInternalError(w http.ResponseWriter, r *http.Request, err error) {
	if r.Context().Err() == nil {
		log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
	}
	writeError(w, http.StatusInternalServerError, "internal error")
}
