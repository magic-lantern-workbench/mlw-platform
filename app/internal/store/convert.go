package store

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/gocql/gocql"
)

// Row is one row as column name to value. Values use plain Go types:
// string, int32, float32, bool, time.Time ([]string for lists), or nil for null.
type Row map[string]any

// toDB converts a decoded JSON value (numbers as json.Number) to the Go type
// the driver expects for the CQL type. nil stays nil (null).
func toDB(typ string, v any) (any, error) {
	if v == nil {
		return nil, nil
	}
	switch typ {
	case "text", "varchar", "ascii":
		s, ok := v.(string)
		if !ok {
			return nil, fmt.Errorf("expected a string")
		}
		return s, nil
	case "int":
		n, err := integer(v, math.MinInt32, math.MaxInt32)
		return int32(n), err
	case "smallint":
		n, err := integer(v, math.MinInt16, math.MaxInt16)
		return int16(n), err
	case "tinyint":
		n, err := integer(v, math.MinInt8, math.MaxInt8)
		return int8(n), err
	case "bigint":
		return integer(v, math.MinInt64, math.MaxInt64)
	case "float":
		f, err := float(v, 32)
		return float32(f), err
	case "double":
		return float(v, 64)
	case "boolean":
		b, ok := v.(bool)
		if !ok {
			return nil, fmt.Errorf("expected true or false")
		}
		return b, nil
	case "timestamp":
		s, ok := v.(string)
		if !ok {
			return nil, fmt.Errorf("expected an RFC 3339 timestamp string")
		}
		t, err := time.Parse(time.RFC3339Nano, s)
		if err != nil {
			return nil, fmt.Errorf("expected an RFC 3339 timestamp such as 2026-10-05T12:00:00Z")
		}
		return t.UTC(), nil
	case "uuid":
		s, ok := v.(string)
		if !ok {
			return nil, fmt.Errorf("expected a UUID string")
		}
		u, err := gocql.ParseUUID(s)
		if err != nil {
			return nil, fmt.Errorf("expected a UUID string")
		}
		return u, nil
	}
	if inner, ok := collectionOf(typ); ok {
		arr, ok := v.([]any)
		if !ok {
			return nil, fmt.Errorf("expected an array")
		}
		switch inner {
		case "text", "varchar", "ascii":
			out := make([]string, 0, len(arr))
			for _, e := range arr {
				s, ok := e.(string)
				if !ok {
					return nil, fmt.Errorf("expected an array of strings")
				}
				out = append(out, s)
			}
			return out, nil
		case "int":
			out := make([]int32, 0, len(arr))
			for _, e := range arr {
				n, err := integer(e, math.MinInt32, math.MaxInt32)
				if err != nil {
					return nil, fmt.Errorf("expected an array of integers")
				}
				out = append(out, int32(n))
			}
			return out, nil
		}
	}
	return nil, fmt.Errorf("column type %s is not supported by the API", typ)
}

// supported reports whether the API can read and write the CQL type.
func supported(typ string) bool {
	switch typ {
	case "text", "varchar", "ascii", "int", "smallint", "tinyint", "bigint",
		"float", "double", "boolean", "timestamp", "uuid":
		return true
	}
	inner, ok := collectionOf(typ)
	return ok && (inner == "text" || inner == "varchar" || inner == "ascii" || inner == "int")
}

// collectionOf returns the element type of list<x> and set<x>.
func collectionOf(typ string) (string, bool) {
	for _, p := range []string{"list<", "set<"} {
		if strings.HasPrefix(typ, p) && strings.HasSuffix(typ, ">") {
			return typ[len(p) : len(typ)-1], true
		}
	}
	return "", false
}

func integer(v any, lo, hi int64) (int64, error) {
	var n int64
	switch x := v.(type) {
	case json.Number:
		var err error
		if n, err = strconv.ParseInt(x.String(), 10, 64); err != nil {
			return 0, fmt.Errorf("expected an integer")
		}
	case int32:
		n = int64(x)
	case int64:
		n = x
	case int:
		n = int64(x)
	default:
		return 0, fmt.Errorf("expected an integer")
	}
	if n < lo || n > hi {
		return 0, fmt.Errorf("integer out of range")
	}
	return n, nil
}

func float(v any, bits int) (float64, error) {
	switch x := v.(type) {
	case json.Number:
		f, err := strconv.ParseFloat(x.String(), bits)
		if err != nil || math.IsInf(f, 0) {
			return 0, fmt.Errorf("expected a number")
		}
		return f, nil
	case float32:
		return float64(x), nil
	case float64:
		return x, nil
	}
	return 0, fmt.Errorf("expected a number")
}

// parseKey converts a path segment to the value of a key column.
func parseKey(typ, s string) (any, error) {
	switch typ {
	case "text", "varchar", "ascii":
		if s == "" {
			return nil, fmt.Errorf("key values must not be empty")
		}
		return s, nil
	case "int", "smallint", "tinyint", "bigint":
		return toDB(typ, json.Number(s))
	case "uuid":
		return toDB(typ, s)
	case "timestamp":
		return toDB(typ, s)
	}
	return nil, fmt.Errorf("key type %s is not supported by the API", typ)
}

// newDest returns a scan destination for the CQL type and a function that
// reads the scanned value back as a Go value, nil for a CQL null.
func newDest(typ string) (dest any, get func() any) {
	switch typ {
	case "text", "varchar", "ascii":
		p := new(*string)
		return p, func() any { return deref(*p) }
	case "int":
		p := new(*int32)
		return p, func() any { return deref(*p) }
	case "smallint":
		p := new(*int16)
		return p, func() any { return deref(*p) }
	case "tinyint":
		p := new(*int8)
		return p, func() any { return deref(*p) }
	case "bigint":
		p := new(*int64)
		return p, func() any { return deref(*p) }
	case "float":
		p := new(*float32)
		return p, func() any { return deref(*p) }
	case "double":
		p := new(*float64)
		return p, func() any { return deref(*p) }
	case "boolean":
		p := new(*bool)
		return p, func() any { return deref(*p) }
	case "timestamp":
		p := new(*time.Time)
		return p, func() any {
			if *p == nil {
				return nil
			}
			return (*p).UTC()
		}
	case "uuid":
		p := new(*gocql.UUID)
		return p, func() any { return deref(*p) }
	}
	if inner, ok := collectionOf(typ); ok && inner == "int" {
		p := new([]int32)
		return p, func() any {
			if *p == nil {
				return []int32{}
			}
			return *p
		}
	}
	p := new([]string)
	return p, func() any {
		if *p == nil {
			return []string{}
		}
		return *p
	}
}

func deref[T any](p *T) any {
	if p == nil {
		return nil
	}
	return *p
}
