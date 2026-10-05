package store

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"
)

func TestToDB(t *testing.T) {
	ok := []struct {
		typ  string
		in   any
		want any
	}{
		{"text", "hi", "hi"},
		{"int", json.Number("42"), int32(42)},
		{"float", json.Number("23.976"), float32(23.976)},
		{"boolean", true, true},
		{"timestamp", "2026-10-05T12:00:00+02:00", time.Date(2026, 10, 5, 10, 0, 0, 0, time.UTC)},
		{"list<text>", []any{"a", "b"}, []string{"a", "b"}},
		{"text", nil, nil},
	}
	for _, c := range ok {
		got, err := toDB(c.typ, c.in)
		if err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("toDB(%s, %v) = %v, %v; want %v", c.typ, c.in, got, err, c.want)
		}
	}
	bad := []struct {
		typ string
		in  any
	}{
		{"text", json.Number("1")},
		{"int", json.Number("1.5")},
		{"int", json.Number("99999999999")},
		{"boolean", "true"},
		{"timestamp", "yesterday"},
		{"list<text>", []any{json.Number("1")}},
		{"list<text>", "a"},
		{"map<text,text>", map[string]any{}},
	}
	for _, c := range bad {
		if got, err := toDB(c.typ, c.in); err == nil {
			t.Errorf("toDB(%s, %v) = %v; want an error", c.typ, c.in, got)
		}
	}
}

func TestParseKey(t *testing.T) {
	if v, err := parseKey("int", "7"); err != nil || v != int32(7) {
		t.Errorf("int key: %v %v", v, err)
	}
	if _, err := parseKey("int", "x"); err == nil {
		t.Error("want error for non-numeric int key")
	}
	if _, err := parseKey("text", ""); err == nil {
		t.Error("want error for empty text key")
	}
}

func TestSupported(t *testing.T) {
	for typ, want := range map[string]bool{"text": true, "list<text>": true, "set<int>": true, "map<text,text>": false, "blob": false, "list<float>": false} {
		if supported(typ) != want {
			t.Errorf("supported(%s) = %v", typ, !want)
		}
	}
}
