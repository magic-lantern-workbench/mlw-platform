// Package store reads and writes the rows of the Cassandra tables. Table
// definitions are read from system_schema, so the API follows the schema.
package store

import (
	"fmt"
	"sort"

	"github.com/gocql/gocql"
)

// Column describes one column of a table.
type Column struct {
	Name string `json:"name"`
	Type string `json:"type"`
	// Kind is partition_key, clustering, static or regular.
	Kind string `json:"kind"`
}

// Table describes a table and its key.
type Table struct {
	Name       string   `json:"name"`
	Columns    []Column `json:"columns"`
	Partition  []string `json:"partitionKey"`
	Clustering []string `json:"clusteringKey"`
	Static     []string `json:"staticColumns"`
	// ReadOnly tables are maintained by the API from another table.
	ReadOnly    bool   `json:"readOnly"`
	DerivedFrom string `json:"derivedFrom,omitempty"`

	byName map[string]Column
}

// Key returns the full primary key: partition columns, then clustering columns.
func (t *Table) Key() []string {
	return append(append([]string{}, t.Partition...), t.Clustering...)
}

// Column returns the named column.
func (t *Table) Column(name string) (Column, bool) {
	c, ok := t.byName[name]
	return c, ok
}

func (t *Table) isKey(name string) bool {
	c, ok := t.byName[name]
	return ok && (c.Kind == "partition_key" || c.Kind == "clustering")
}

func (t *Table) isStatic(name string) bool {
	c, ok := t.byName[name]
	return ok && c.Kind == "static"
}

// loadTables reads the definitions of all tables in the keyspace.
func loadTables(s *gocql.Session, keyspace string) (map[string]*Table, []string, error) {
	type colRow struct {
		table, name, kind, typ string
		pos                    int
	}
	var rows []colRow
	it := s.Query(`SELECT table_name, column_name, kind, position, type FROM system_schema.columns WHERE keyspace_name = ?`, keyspace).Iter()
	var r colRow
	for it.Scan(&r.table, &r.name, &r.kind, &r.pos, &r.typ) {
		rows = append(rows, r)
	}
	if err := it.Close(); err != nil {
		return nil, nil, fmt.Errorf("reading schema of keyspace %q: %w", keyspace, err)
	}
	if len(rows) == 0 {
		return nil, nil, fmt.Errorf("keyspace %q has no tables; create the schema first (APPLY_SCHEMA=true applies cql/*.cql)", keyspace)
	}
	sort.Slice(rows, func(i, j int) bool {
		a, b := rows[i], rows[j]
		if a.table != b.table {
			return a.table < b.table
		}
		if ka, kb := kindRank(a.kind), kindRank(b.kind); ka != kb {
			return ka < kb
		}
		if a.pos != b.pos {
			return a.pos < b.pos
		}
		return a.name < b.name
	})
	tables := map[string]*Table{}
	var skipped []string
	for _, r := range rows {
		if !supported(r.typ) {
			if r.kind == "partition_key" || r.kind == "clustering" {
				return nil, nil, fmt.Errorf("key column %s.%s has unsupported type %s", r.table, r.name, r.typ)
			}
			skipped = append(skipped, fmt.Sprintf("%s.%s (%s)", r.table, r.name, r.typ))
			continue
		}
		t := tables[r.table]
		if t == nil {
			t = &Table{Name: r.table, byName: map[string]Column{}}
			tables[r.table] = t
		}
		c := Column{Name: r.name, Type: r.typ, Kind: r.kind}
		t.Columns = append(t.Columns, c)
		t.byName[c.Name] = c
		switch r.kind {
		case "partition_key":
			t.Partition = append(t.Partition, r.name)
		case "clustering":
			t.Clustering = append(t.Clustering, r.name)
		case "static":
			t.Static = append(t.Static, r.name)
		}
	}
	for _, t := range tables {
		if t.Clustering == nil {
			t.Clustering = []string{}
		}
		if t.Static == nil {
			t.Static = []string{}
		}
		if src, ok := derivedTables[t.Name]; ok {
			t.ReadOnly, t.DerivedFrom = true, src
		}
	}
	return tables, skipped, nil
}

func kindRank(k string) int {
	switch k {
	case "partition_key":
		return 0
	case "clustering":
		return 1
	case "static":
		return 2
	}
	return 3
}
