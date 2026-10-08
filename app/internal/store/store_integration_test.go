package store

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/magic-lantern-workbench/mlw-platform/app/internal/config"
)

// Runs against a real Cassandra with the mlw schema, for example the dev
// container:  CASSANDRA_TEST_HOSTS=localhost go test ./internal/store
// It writes rows under the project id "itest" and removes them again.
func testStore(t *testing.T) *Store {
	hosts := os.Getenv("CASSANDRA_TEST_HOSTS")
	if hosts == "" {
		t.Skip("CASSANDRA_TEST_HOSTS not set")
	}
	cfg := config.Config{Hosts: strings.Split(hosts, ","), Port: 9042, Keyspace: "mlw", Consistency: "LOCAL_ONE",
		Username: os.Getenv("CASSANDRA_TEST_USERNAME"), Password: os.Getenv("CASSANDRA_TEST_PASSWORD"),
		DisableInitialHostLookup: true, StartupWait: 30 * time.Second}
	st, err := Connect(context.Background(), cfg, slog.New(slog.NewTextHandler(os.Stderr, nil)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(st.Close)
	return st
}

func mustTable(t *testing.T, st *Store, name string) *Table {
	tb, ok := st.Table(name)
	if !ok {
		t.Fatalf("no table %s", name)
	}
	return tb
}

func TestCRUD(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()
	tb := mustTable(t, st, "shot")
	body := func(rate string) map[string]any {
		return decode(t, `{"project_id":"itest","episode_id":"e","sequence_id":"s","scene_id":"c","shot_id":"h","frame_rate":`+rate+`,"start_frame":1,"end_frame":48,"description":"d"}`)
	}
	key := []any{"itest", "e", "s", "c", "h"}
	t.Cleanup(func() { st.Delete(ctx, tb, key) })

	if _, err := st.Create(ctx, tb, body("24")); err != nil {
		t.Fatal(err)
	}
	if _, err := st.Create(ctx, tb, body("24")); !errors.Is(err, ErrConflict) {
		t.Fatalf("second create: %v, want conflict", err)
	}
	row, err := st.Get(ctx, tb, key)
	if err != nil || row["frame_rate"] != float32(24) || row["end_frame"] != int32(48) {
		t.Fatalf("get: %v %v", row, err)
	}
	// PATCH changes only the given column; PUT nulls the rest
	if row, err = st.Update(ctx, tb, key, decode(t, `{"frame_rate":25}`), false); err != nil || row["frame_rate"] != float32(25) || row["description"] != "d" {
		t.Fatalf("patch: %v %v", row, err)
	}
	if row, err = st.Update(ctx, tb, key, decode(t, `{"frame_rate":30}`), true); err != nil || row["frame_rate"] != float32(30) || row["description"] != nil {
		t.Fatalf("put: %v %v", row, err)
	}
	if _, err = st.Update(ctx, tb, []any{"itest", "e", "s", "c", "nope"}, decode(t, `{"frame_rate":1}`), false); !errors.Is(err, ErrNotFound) {
		t.Fatalf("update missing: %v", err)
	}
	if err = st.Delete(ctx, tb, key); err != nil {
		t.Fatal(err)
	}
	if _, err = st.Get(ctx, tb, key); !errors.Is(err, ErrNotFound) {
		t.Fatalf("get after delete: %v", err)
	}
	if _, err = st.Create(ctx, tb, decode(t, `{"project_id":"itest"}`)); err == nil {
		t.Fatal("create without the full key should fail")
	}
	if _, err = st.Create(ctx, tb, decode(t, `{"project_id":"itest","episode_id":"e","sequence_id":"s","scene_id":"c","shot_id":"h","bogus":1}`)); err == nil {
		t.Fatal("unknown column should fail")
	}
}

func TestListPaging(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()
	tb := mustTable(t, st, "scene")
	for _, id := range []string{"a", "b", "c"} {
		if _, err := st.Create(ctx, tb, decode(t, `{"project_id":"itest","episode_id":"e","sequence_id":"s","scene_id":"c","shot_id":"`+id+`"}`)); err != nil {
			t.Fatal(err)
		}
		id := id
		t.Cleanup(func() { st.Delete(ctx, tb, []any{"itest", "e", "s", "c", id}) })
	}
	rows, next, err := st.List(ctx, tb, []any{"itest", "e", "s", "c"}, 2, nil)
	if err != nil || len(rows) != 2 || len(next) == 0 {
		t.Fatalf("page 1: %d rows, next %v, %v", len(rows), next, err)
	}
	rows, next, err = st.List(ctx, tb, []any{"itest", "e", "s", "c"}, 2, next)
	if err != nil || len(rows) != 1 || len(next) != 0 {
		t.Fatalf("page 2: %d rows, next %v, %v", len(rows), next, err)
	}
	if _, _, err = st.List(ctx, tb, []any{"itest"}, 2, nil); err == nil {
		t.Fatal("a partial partition key should be rejected")
	}
}

func TestStaticColumns(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()
	tb := mustTable(t, st, "timeline")
	part := []any{"itest", "t1"}
	t.Cleanup(func() {
		st.Delete(ctx, tb, []any{"itest", "t1", int32(1)})
		st.session.Query(`DELETE FROM mlw.timeline WHERE project_id='itest' AND timeline_id='t1'`).Exec()
	})
	if _, err := st.Create(ctx, tb, decode(t, `{"project_id":"itest","timeline_id":"t1","name":"Cut"}`)); err != nil {
		t.Fatalf("static-only create: %v", err)
	}
	if _, err := st.Create(ctx, tb, decode(t, `{"project_id":"itest","timeline_id":"t1","position":1,"shot_id":"h"}`)); err != nil {
		t.Fatal(err)
	}
	if _, err := st.Update(ctx, tb, part, decode(t, `{"description":"new"}`), false); err != nil {
		t.Fatalf("static update: %v", err)
	}
	row, err := st.Get(ctx, tb, []any{"itest", "t1", int32(1)})
	if err != nil || row["name"] != "Cut" || row["description"] != "new" {
		t.Fatalf("row %v %v", row, err)
	}
	if _, err := st.Update(ctx, tb, part, decode(t, `{"shot_id":"x"}`), false); err == nil {
		t.Fatal("a partition-only update of a regular column should fail")
	}
}

func TestLookupTables(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()
	users, byEmail := mustTable(t, st, "user"), mustTable(t, st, "user_by_email")
	cleanup := func() {
		for _, id := range []string{"u1", "u2"} {
			st.Delete(ctx, users, []any{id})
		}
		for _, e := range []string{"a@x.org", "b@x.org"} {
			st.session.Query(`DELETE FROM mlw.user_by_email WHERE email = ?`, e).Exec()
		}
	}
	cleanup()
	t.Cleanup(cleanup)

	if _, err := st.Create(ctx, users, decode(t, `{"user_id":"u1","email":"a@x.org"}`)); err != nil {
		t.Fatal(err)
	}
	if r, err := st.Get(ctx, byEmail, []any{"a@x.org"}); err != nil || r["user_id"] != "u1" {
		t.Fatalf("lookup after create: %v %v", r, err)
	}
	if _, err := st.Create(ctx, users, decode(t, `{"user_id":"u2","email":"a@x.org"}`)); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate email: %v", err)
	}
	if _, err := st.Update(ctx, users, []any{"u1"}, decode(t, `{"email":"b@x.org"}`), false); err != nil {
		t.Fatal(err)
	}
	if _, err := st.Get(ctx, byEmail, []any{"a@x.org"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("old email still present: %v", err)
	}
	if r, err := st.Get(ctx, byEmail, []any{"b@x.org"}); err != nil || r["user_id"] != "u1" {
		t.Fatalf("new email: %v %v", r, err)
	}
	if err := st.Delete(ctx, users, []any{"u1"}); err != nil {
		t.Fatal(err)
	}
	if _, err := st.Get(ctx, byEmail, []any{"b@x.org"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("lookup after delete: %v", err)
	}
	if _, err := st.Create(ctx, byEmail, decode(t, `{"email":"c@x.org","user_id":"u1"}`)); !errors.Is(err, ErrReadOnly) {
		t.Fatalf("write to lookup table: %v", err)
	}
}

func TestReviewByFrame(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()
	reviews, byFrame := mustTable(t, st, "review"), mustTable(t, st, "review_by_frame")
	t.Cleanup(func() { st.Delete(ctx, reviews, []any{"itest", "r1"}) })
	if _, err := st.Create(ctx, reviews, decode(t, `{"project_id":"itest","review_id":"r1","episode_id":"e","sequence_id":"s","scene_id":"c","shot_id":"h","frame_number":5,"reviewer":"u","status":"pending"}`)); err != nil {
		t.Fatal(err)
	}
	k := []any{"itest", "e", "s", "c", "h", int32(5), "r1"}
	if r, err := st.Get(ctx, byFrame, k); err != nil || r["status"] != "pending" {
		t.Fatalf("lookup: %v %v", r, err)
	}
	if _, err := st.Update(ctx, reviews, []any{"itest", "r1"}, decode(t, `{"status":"approved"}`), false); err != nil {
		t.Fatal(err)
	}
	if r, _ := st.Get(ctx, byFrame, k); r["status"] != "approved" {
		t.Fatalf("status not synced: %v", r)
	}
	if _, err := st.Update(ctx, reviews, []any{"itest", "r1"}, decode(t, `{"frame_number":6}`), false); err != nil {
		t.Fatal(err)
	}
	if _, err := st.Get(ctx, byFrame, k); !errors.Is(err, ErrNotFound) {
		t.Fatalf("old frame row still present: %v", err)
	}
	if _, err := st.Get(ctx, byFrame, []any{"itest", "e", "s", "c", "h", int32(6), "r1"}); err != nil {
		t.Fatalf("new frame row: %v", err)
	}
	if err := st.Delete(ctx, reviews, []any{"itest", "r1"}); err != nil {
		t.Fatal(err)
	}
	if _, err := st.Get(ctx, byFrame, []any{"itest", "e", "s", "c", "h", int32(6), "r1"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("lookup after delete: %v", err)
	}
}

func decode(t *testing.T, s string) map[string]any {
	t.Helper()
	var m map[string]any
	d := jsonDecoder(s)
	if err := d.Decode(&m); err != nil {
		t.Fatal(err)
	}
	return m
}
