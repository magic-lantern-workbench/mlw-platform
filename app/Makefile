# Local development helpers. The Docker image does all of this itself.
.PHONY: schema web build test

# go:embed cannot reach outside the module, so copy the schema files and the
# OpenAPI specification next to the code.
schema:
	cp ../cql/*.cql internal/schema/cql/
	cp ../doc/openapi.yaml internal/api/spec/

web:
	cd web && npm ci && npm run build

build: schema web
	CGO_ENABLED=0 go build -o bin/mlw-app ./cmd/mlw-app

test:
	go test ./...
