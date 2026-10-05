// Package schema holds the CQL files that define the keyspace and applies them.
package schema

import (
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"github.com/gocql/gocql"
)

// The cql directory is a copy of the repository's cql/*.cql, made by the
// Dockerfile (or `make schema`) because go:embed cannot reach outside the module.
//
//go:embed all:cql
var files embed.FS

// Statements returns the CQL statements of all embedded files, in file order.
func Statements() ([]string, error) {
	entries, err := fs.ReadDir(files, "cql")
	if err != nil {
		return nil, err
	}
	var names []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".cql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	var out []string
	for _, n := range names {
		b, err := fs.ReadFile(files, "cql/"+n)
		if err != nil {
			return nil, err
		}
		out = append(out, split(string(b))...)
	}
	return out, nil
}

// split removes -- comments and splits the text into statements on ';'.
func split(src string) []string {
	var lines []string
	for _, l := range strings.Split(src, "\n") {
		if i := strings.Index(l, "--"); i >= 0 {
			l = l[:i]
		}
		lines = append(lines, l)
	}
	var out []string
	for _, s := range strings.Split(strings.Join(lines, "\n"), ";") {
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// Apply runs every embedded statement. The files only use IF NOT EXISTS, so
// applying them repeatedly is safe.
func Apply(s *gocql.Session) error {
	stmts, err := Statements()
	if err != nil {
		return err
	}
	if len(stmts) == 0 {
		return fmt.Errorf("no embedded cql files; copy cql/*.cql into app/internal/schema/cql (make schema)")
	}
	for _, st := range stmts {
		if err := s.Query(st).Exec(); err != nil {
			return fmt.Errorf("applying %q: %w", firstLine(st), err)
		}
	}
	return nil
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}
