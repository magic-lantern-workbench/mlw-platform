package api

import (
	"embed"
	"fmt"
	"net/http"

	"gopkg.in/yaml.v3"
)

// The spec directory holds a copy of doc/openapi.yaml, made by the Dockerfile
// (or `make schema`) because go:embed cannot reach outside the module.
//
//go:embed all:spec
var specFiles embed.FS

// serverURL is what the served specification points at: the server it is
// served from, so "Try it out" in Swagger UI calls this application.
const serverURL = "/api/v1"

// specForThisServer returns the OpenAPI document with its servers replaced by
// a single relative URL. The file in doc/ keeps a configurable server so it
// works for other tools; this copy only changes where requests go.
func specForThisServer(src []byte) ([]byte, error) {
	var doc yaml.Node
	if err := yaml.Unmarshal(src, &doc); err != nil {
		return nil, fmt.Errorf("parsing the OpenAPI document: %w", err)
	}
	if doc.Kind != yaml.DocumentNode || len(doc.Content) != 1 || doc.Content[0].Kind != yaml.MappingNode {
		return nil, fmt.Errorf("the OpenAPI document is not a mapping")
	}
	root := doc.Content[0]
	servers := &yaml.Node{Kind: yaml.SequenceNode, Content: []*yaml.Node{{
		Kind: yaml.MappingNode,
		Content: []*yaml.Node{
			{Kind: yaml.ScalarNode, Value: "url"}, {Kind: yaml.ScalarNode, Value: serverURL},
			{Kind: yaml.ScalarNode, Value: "description"}, {Kind: yaml.ScalarNode, Value: "This server"},
		},
	}}}
	replaced := false
	for i := 0; i+1 < len(root.Content); i += 2 {
		if root.Content[i].Value == "servers" {
			root.Content[i+1] = servers
			replaced = true
		}
	}
	if !replaced {
		root.Content = append(root.Content, &yaml.Node{Kind: yaml.ScalarNode, Value: "servers"}, servers)
	}
	return yaml.Marshal(&doc)
}

// loadSpec reads the embedded specification, or returns nil if there is none.
func loadSpec() ([]byte, error) {
	src, err := specFiles.ReadFile("spec/openapi.yaml")
	if err != nil {
		return nil, nil
	}
	return specForThisServer(src)
}

// openapi serves the specification. It needs no token: it describes the API
// and holds no data.
func (s *Server) openapi(w http.ResponseWriter, r *http.Request) {
	if s.spec == nil {
		writeError(w, http.StatusNotFound, "not_found", "this build does not include the OpenAPI specification")
		return
	}
	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Write(s.spec)
}
