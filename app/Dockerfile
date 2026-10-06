# Build from the repository root so the cql/ directory is in the build context:
#   docker build -f app/Dockerfile -t mlw-app .

# ---- web UI ----
FROM node:22-alpine AS web
WORKDIR /web
COPY app/web/package.json app/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/web/ ./
RUN npm run build

# ---- server ----
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY app/go.mod app/go.sum ./
RUN go mod download
COPY app/ ./
COPY --from=web /web/dist ./web/dist
# go:embed cannot reach outside the module, so the schema is copied in
COPY cql/ ./internal/schema/cql/
# the OpenAPI specification is served at /api/v1/openapi.yaml
COPY doc/openapi.yaml ./internal/api/spec/openapi.yaml
RUN CGO_ENABLED=0 go test ./... && \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/mlw-app ./cmd/mlw-app

# ---- runtime ----
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/mlw-app /mlw-app
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 CMD ["/mlw-app", "-healthcheck"]
ENTRYPOINT ["/mlw-app"]
