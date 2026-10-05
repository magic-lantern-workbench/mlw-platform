package store

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	"github.com/gocql/gocql"
)

var (
	// ErrNotFound means no row has the given key.
	ErrNotFound = errors.New("not found")
	// ErrConflict means a row with the given key already exists, or a unique
	// value (a user's email) is taken.
	ErrConflict = errors.New("conflict")
	// ErrReadOnly means the table is maintained by the API and cannot be written directly.
	ErrReadOnly = errors.New("table is read-only")
)

// BadRequestError is returned for input that cannot be used.
type BadRequestError struct{ Msg string }

func (e *BadRequestError) Error() string { return e.Msg }

func badf(format string, a ...any) error { return &BadRequestError{fmt.Sprintf(format, a...)} }

// Store gives access to the tables of one keyspace.
type Store struct {
	session  *gocql.Session
	keyspace string
	tables   map[string]*Table
	log      *slog.Logger
}

// Close releases the connection.
func (s *Store) Close() { s.session.Close() }

// Keyspace returns the keyspace name.
func (s *Store) Keyspace() string { return s.keyspace }

// Ping checks that the cluster answers.
func (s *Store) Ping(ctx context.Context) error {
	var v string
	return s.session.Query(`SELECT release_version FROM system.local`).WithContext(ctx).Scan(&v)
}

// Tables returns all tables sorted by name.
func (s *Store) Tables() []*Table {
	out := make([]*Table, 0, len(s.tables))
	for _, t := range s.tables {
		out = append(out, t)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// Table returns the named table.
func (s *Store) Table(name string) (*Table, bool) {
	t, ok := s.tables[name]
	return t, ok
}

func (s *Store) qname(t *Table) string { return fmt.Sprintf(`"%s"."%s"`, s.keyspace, t.Name) }

func quoteAll(cols []string) []string {
	out := make([]string, len(cols))
	for i, c := range cols {
		out[i] = `"` + c + `"`
	}
	return out
}

func where(cols []string) string {
	parts := make([]string, len(cols))
	for i, c := range cols {
		parts[i] = `"` + c + `" = ?`
	}
	return strings.Join(parts, " AND ")
}

// ParseKey converts path segments to key values, in key column order.
func (t *Table) ParseKey(segments []string) ([]any, error) {
	key := t.Key()
	if len(segments) > len(key) {
		return nil, badf("%s has a key of %d value(s) (%s); got %d", t.Name, len(key), strings.Join(key, ", "), len(segments))
	}
	out := make([]any, len(segments))
	for i, seg := range segments {
		c, _ := t.Column(key[i])
		v, err := parseKey(c.Type, seg)
		if err != nil {
			return nil, badf("%s: %v", key[i], err)
		}
		out[i] = v
	}
	return out, nil
}

// List returns the rows whose key starts with the given values. With no values
// it scans the table. Otherwise all partition key values are required. The
// result is one page; next is non-empty when more rows follow.
func (s *Store) List(ctx context.Context, t *Table, key []any, limit int, page []byte) (rows []Row, next []byte, err error) {
	if n := len(key); n > 0 && n < len(t.Partition) {
		return nil, nil, badf("%s needs all %d partition key values (%s) to list rows", t.Name, len(t.Partition), strings.Join(t.Partition, ", "))
	}
	cols := make([]string, len(t.Columns))
	for i, c := range t.Columns {
		cols[i] = c.Name
	}
	q := fmt.Sprintf(`SELECT %s FROM %s`, strings.Join(quoteAll(cols), ", "), s.qname(t))
	if len(key) > 0 {
		q += " WHERE " + where(t.Key()[:len(key)])
	}
	it := s.session.Query(q, key...).WithContext(ctx).PageSize(limit).PageState(page).Iter()

	dests := make([]any, len(cols))
	gets := make([]func() any, len(cols))
	for i, c := range t.Columns {
		dests[i], gets[i] = newDest(c.Type)
	}
	rows = []Row{}
	for len(rows) < limit && it.Scan(dests...) {
		row := Row{}
		for i, c := range cols {
			row[c] = gets[i]()
		}
		rows = append(rows, row)
	}
	next = it.PageState()
	if err := it.Close(); err != nil {
		return nil, nil, err
	}
	return rows, next, nil
}

// Get returns the row with the full key, or ErrNotFound.
func (s *Store) Get(ctx context.Context, t *Table, key []any) (Row, error) {
	if len(key) != len(t.Key()) {
		return nil, badf("%s needs %d key values (%s)", t.Name, len(t.Key()), strings.Join(t.Key(), ", "))
	}
	rows, _, err := s.List(ctx, t, key, 1, nil)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, ErrNotFound
	}
	return rows[0], nil
}

// convert turns a decoded JSON object into a Row of driver values.
func (t *Table) convert(body map[string]any) (Row, error) {
	out := Row{}
	for name, v := range body {
		c, ok := t.Column(name)
		if !ok {
			return nil, badf("unknown column %q in %s", name, t.Name)
		}
		dv, err := toDB(c.Type, v)
		if err != nil {
			return nil, badf("%s: %v", name, err)
		}
		out[name] = dv
	}
	return out, nil
}

// Create inserts a row. The body must contain every key column, and fails
// with ErrConflict if the row exists. For tables with static columns, a body
// that has the partition key and only static columns sets the static columns
// of the partition (an upsert).
func (s *Store) Create(ctx context.Context, t *Table, body map[string]any) (Row, error) {
	if t.ReadOnly {
		return nil, ErrReadOnly
	}
	vals, err := t.convert(body)
	if err != nil {
		return nil, err
	}
	for _, c := range t.Partition {
		if err := requireKey(vals, c); err != nil {
			return nil, err
		}
	}
	if s.staticOnly(t, vals) {
		if err := s.writeStatic(ctx, t, vals); err != nil {
			return nil, err
		}
		return vals, nil
	}
	for _, c := range t.Clustering {
		if err := requireKey(vals, c); err != nil {
			return nil, err
		}
	}
	if h := hooks[t.Name]; h.before != nil {
		if err := h.before(ctx, s, nil, vals); err != nil {
			return nil, err
		}
	}
	var cols []string
	var args []any
	for _, c := range t.Columns {
		if v, ok := vals[c.Name]; ok && v != nil {
			cols = append(cols, c.Name)
			args = append(args, v)
		}
	}
	marks := strings.TrimSuffix(strings.Repeat("?, ", len(cols)), ", ")
	q := fmt.Sprintf(`INSERT INTO %s (%s) VALUES (%s) IF NOT EXISTS`, s.qname(t), strings.Join(quoteAll(cols), ", "), marks)
	applied, err := s.session.Query(q, args...).WithContext(ctx).MapScanCAS(map[string]any{})
	if err != nil {
		return nil, err
	}
	if !applied {
		return nil, ErrConflict
	}
	return s.afterWrite(ctx, t, nil, keyOf(t, vals))
}

// Update changes the row with the given full key. With replace set (PUT) the
// non-key, non-static columns missing from the body are set to null; otherwise
// (PATCH) only the columns in the body change. It returns ErrNotFound if the
// row does not exist. With only the partition key it updates static columns.
func (s *Store) Update(ctx context.Context, t *Table, key []any, body map[string]any, replace bool) (Row, error) {
	if t.ReadOnly {
		return nil, ErrReadOnly
	}
	changes, err := t.convert(body)
	if err != nil {
		return nil, err
	}
	names := t.Key()
	for i, v := range key {
		if got, ok := changes[names[i]]; ok {
			if fmt.Sprint(got) != fmt.Sprint(v) {
				return nil, badf("%s in the body (%v) does not match the URL (%v)", names[i], got, v)
			}
			delete(changes, names[i])
		}
	}
	switch {
	case len(key) == len(t.Partition) && len(t.Clustering) > 0:
		return s.updateStatic(ctx, t, key, changes)
	case len(key) != len(names):
		return nil, badf("%s needs %d key values (%s) to update a row", t.Name, len(names), strings.Join(names, ", "))
	}
	if replace {
		for _, c := range t.Columns {
			if _, ok := changes[c.Name]; !ok && c.Kind == "regular" {
				changes[c.Name] = nil
			}
		}
	}
	if len(changes) == 0 {
		return nil, badf("no columns to update")
	}
	old, err := s.Get(ctx, t, key)
	if err != nil {
		return nil, err
	}
	incoming := Row{}
	for k, v := range changes {
		incoming[k] = v
	}
	for i, v := range key {
		incoming[names[i]] = v
	}
	if h := hooks[t.Name]; h.before != nil {
		if err := h.before(ctx, s, old, incoming); err != nil {
			return nil, err
		}
	}
	var cols []string
	var args []any
	for _, c := range t.Columns {
		if v, ok := changes[c.Name]; ok {
			cols = append(cols, c.Name)
			args = append(args, v)
		}
	}
	sets := make([]string, len(cols))
	for i, c := range cols {
		sets[i] = `"` + c + `" = ?`
	}
	q := fmt.Sprintf(`UPDATE %s SET %s WHERE %s IF EXISTS`, s.qname(t), strings.Join(sets, ", "), where(names))
	applied, err := s.session.Query(q, append(args, key...)...).WithContext(ctx).MapScanCAS(map[string]any{})
	if err != nil {
		return nil, err
	}
	if !applied {
		return nil, ErrNotFound
	}
	return s.afterWrite(ctx, t, old, key)
}

// Delete removes the row with the given full key, or returns ErrNotFound.
func (s *Store) Delete(ctx context.Context, t *Table, key []any) error {
	if t.ReadOnly {
		return ErrReadOnly
	}
	names := t.Key()
	if len(key) != len(names) {
		return badf("%s needs %d key values (%s) to delete a row", t.Name, len(names), strings.Join(names, ", "))
	}
	old, err := s.Get(ctx, t, key)
	if err != nil {
		return err
	}
	q := fmt.Sprintf(`DELETE FROM %s WHERE %s IF EXISTS`, s.qname(t), where(names))
	applied, err := s.session.Query(q, key...).WithContext(ctx).MapScanCAS(map[string]any{})
	if err != nil {
		return err
	}
	if !applied {
		return ErrNotFound
	}
	if h := hooks[t.Name]; h.after != nil {
		if err := h.after(ctx, s, old, nil); err != nil {
			return fmt.Errorf("row deleted, but updating the lookup table failed: %w", err)
		}
	}
	return nil
}

// afterWrite re-reads the written row and runs the lookup table hook.
func (s *Store) afterWrite(ctx context.Context, t *Table, old Row, key []any) (Row, error) {
	row, err := s.Get(ctx, t, key)
	if err != nil {
		return nil, err
	}
	if h := hooks[t.Name]; h.after != nil {
		if err := h.after(ctx, s, old, row); err != nil {
			return nil, fmt.Errorf("row written, but updating the lookup table failed (repeat the update to repair it): %w", err)
		}
	}
	return row, nil
}

func (s *Store) staticOnly(t *Table, vals Row) bool {
	if len(t.Static) == 0 {
		return false
	}
	for _, c := range t.Clustering {
		if _, ok := vals[c]; ok {
			return false
		}
	}
	n := 0
	for name := range vals {
		if t.isKey(name) {
			continue
		}
		if !t.isStatic(name) {
			return false
		}
		n++
	}
	return n > 0
}

func (s *Store) writeStatic(ctx context.Context, t *Table, vals Row) error {
	var cols []string
	var args []any
	for _, c := range t.Columns {
		if c.Kind == "static" {
			if v, ok := vals[c.Name]; ok {
				cols = append(cols, c.Name)
				args = append(args, v)
			}
		}
	}
	return s.setStatic(ctx, t, cols, args, partitionOf(t, vals))
}

func (s *Store) updateStatic(ctx context.Context, t *Table, key []any, changes Row) (Row, error) {
	var cols []string
	var args []any
	for _, c := range t.Columns {
		v, ok := changes[c.Name]
		if !ok {
			continue
		}
		if c.Kind != "static" {
			return nil, badf("a URL with only the partition key (%s) can update only static columns (%s)", strings.Join(t.Partition, ", "), strings.Join(t.Static, ", "))
		}
		cols = append(cols, c.Name)
		args = append(args, v)
	}
	if len(cols) == 0 {
		return nil, badf("no columns to update")
	}
	if err := s.setStatic(ctx, t, cols, args, key); err != nil {
		return nil, err
	}
	out := Row{}
	for i, k := range t.Partition {
		out[k] = key[i]
	}
	for i, c := range cols {
		out[c] = args[i]
	}
	return out, nil
}

func (s *Store) setStatic(ctx context.Context, t *Table, cols []string, args []any, partition []any) error {
	sets := make([]string, len(cols))
	for i, c := range cols {
		sets[i] = `"` + c + `" = ?`
	}
	q := fmt.Sprintf(`UPDATE %s SET %s WHERE %s`, s.qname(t), strings.Join(sets, ", "), where(t.Partition))
	return (s.session.Query(q, append(args, partition...)...).WithContext(ctx).Exec())
}

func requireKey(vals Row, col string) error {
	v, ok := vals[col]
	if !ok || v == nil {
		return badf("%s is required", col)
	}
	if s, isStr := v.(string); isStr && s == "" {
		return badf("%s must not be empty", col)
	}
	return nil
}

func keyOf(t *Table, vals Row) []any {
	var key []any
	for _, c := range t.Key() {
		key = append(key, vals[c])
	}
	return key
}

func partitionOf(t *Table, vals Row) []any {
	var key []any
	for _, c := range t.Partition {
		key = append(key, vals[c])
	}
	return key
}

// Kind classifies a driver error: "invalid", "unavailable" or "".
func Kind(err error) string {
	var re gocql.RequestError
	if errors.As(err, &re) {
		switch re.Code() {
		case 0x2200:
			return "invalid"
		case 0x1000, 0x1100, 0x1200:
			return "unavailable"
		}
	}
	if errors.Is(err, gocql.ErrNoConnections) || errors.Is(err, gocql.ErrTimeoutNoResponse) {
		return "unavailable"
	}
	return ""
}
