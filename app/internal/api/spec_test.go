package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

const sample = `openapi: 3.0.3
info:
  title: T
  description: |-
    line one

    line two
servers:
  - url: '{scheme}://{host}:{port}/api/v1'
    variables:
      scheme: {default: http}
paths:
  /health:
    get:
      operationId: getHealth
`

func TestSpecForThisServer(t *testing.T) {
	out, err := specForThisServer([]byte(sample))
	if err != nil {
		t.Fatal(err)
	}
	var m struct {
		Servers []struct{ URL string }    `yaml:"servers"`
		Paths   map[string]map[string]any `yaml:"paths"`
		Info    struct{ Description string }
	}
	if err := yaml.Unmarshal(out, &m); err != nil {
		t.Fatal(err)
	}
	if len(m.Servers) != 1 || m.Servers[0].URL != "/api/v1" {
		t.Errorf("servers: %+v", m.Servers)
	}
	if _, ok := m.Paths["/health"]["get"]; !ok {
		t.Error("paths were lost")
	}
	if !strings.Contains(m.Info.Description, "line one\n\nline two") {
		t.Errorf("description changed: %q", m.Info.Description)
	}

	// a document without servers gets one
	out, err = specForThisServer([]byte("openapi: 3.0.3\n"))
	if err != nil || !strings.Contains(string(out), "url: /api/v1") {
		t.Errorf("no servers: %q %v", out, err)
	}
	if _, err := specForThisServer([]byte("- not a mapping")); err == nil {
		t.Error("a list should be rejected")
	}
}

// The real specification is only present in builds that copied it in.
func TestEmbeddedSpec(t *testing.T) {
	spec, err := loadSpec()
	if err != nil {
		t.Fatal(err)
	}
	if spec == nil {
		t.Skip("no embedded spec (copy doc/openapi.yaml to internal/api/spec)")
	}
	if !strings.Contains(string(spec), "url: /api/v1") || !strings.Contains(string(spec), "operationId: scanProduction") {
		t.Error("the served spec is missing the server or the table operations")
	}
}

func TestOpenAPIHandler(t *testing.T) {
	s := &Server{spec: []byte("openapi: 3.0.3\n")}
	w := httptest.NewRecorder()
	s.openapi(w, httptest.NewRequest("GET", "/api/v1/openapi.yaml", nil))
	if w.Code != http.StatusOK || !strings.HasPrefix(w.Header().Get("Content-Type"), "application/yaml") {
		t.Errorf("%d %q", w.Code, w.Header().Get("Content-Type"))
	}
	w = httptest.NewRecorder()
	(&Server{}).openapi(w, httptest.NewRequest("GET", "/api/v1/openapi.yaml", nil))
	if w.Code != http.StatusNotFound {
		t.Errorf("no spec: %d", w.Code)
	}
}
