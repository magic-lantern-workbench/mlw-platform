package store

import (
	"encoding/json"
	"strings"
)

func jsonDecoder(s string) *json.Decoder {
	d := json.NewDecoder(strings.NewReader(s))
	d.UseNumber()
	return d
}
