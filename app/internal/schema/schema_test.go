package schema

import (
	"reflect"
	"testing"
)

func TestSplit(t *testing.T) {
	src := "-- header; with semicolon\nCREATE TABLE a (\n  x int, -- note\n  PRIMARY KEY (x)\n);\n\n-- c\nCREATE TABLE b (y int PRIMARY KEY);\n"
	want := []string{"CREATE TABLE a (\n  x int,\n  PRIMARY KEY (x)\n)", "CREATE TABLE b (y int PRIMARY KEY)"}
	got := split(src)
	for i := range got {
		got[i] = trimTrailingSpaces(got[i])
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %q want %q", got, want)
	}
}

func trimTrailingSpaces(s string) string {
	out := ""
	for _, l := range splitLines(s) {
		for len(l) > 0 && l[len(l)-1] == ' ' {
			l = l[:len(l)-1]
		}
		out += l + "\n"
	}
	return out[:len(out)-1]
}

func splitLines(s string) []string {
	var r []string
	cur := ""
	for _, c := range s {
		if c == '\n' {
			r = append(r, cur)
			cur = ""
		} else {
			cur += string(c)
		}
	}
	return append(r, cur)
}
