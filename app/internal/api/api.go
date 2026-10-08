// Package api serves the REST API and the embedded web UI.
package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/magic-lantern-workbench/mlw-platform/app/internal/oidcauth"
	"github.com/magic-lantern-workbench/mlw-platform/app/internal/store"
)

const (
	defaultLimit = 100
	maxLimit     = 1000
	maxBody      = 1 << 20
)

// Server serves the API under /api/v1 and the web UI everywhere else.
type Server struct {
	st      *store.Store
	token   string
	static  fs.FS
	log     *slog.Logger
	oidc    *oidcauth.Verifier // nil when login with OpenID Connect is not configured
	oidcCfg authConfig
	spec    []byte // OpenAPI document served at /api/v1/openapi.yaml, nil if not built in
}

// New creates a Server. An empty token disables authentication.
func New(st *store.Store, token string, static fs.FS, log *slog.Logger) *Server {
	spec, err := loadSpec()
	if err != nil {
		log.Error("the embedded OpenAPI specification is not usable", "error", err)
	}
	return &Server{st: st, token: token, static: static, log: log, spec: spec}
}

// authConfig is what the web UI needs to log in; it is public.
type authConfig struct {
	Enabled  bool   `json:"enabled"`
	Issuer   string `json:"issuer,omitempty"`
	ClientID string `json:"clientId,omitempty"`
	// TokenAuth tells the UI whether a static API token is also accepted
	TokenAuth bool `json:"tokenAuth"`
}

// UseOIDC makes the API accept access tokens that v verifies, and publishes
// the issuer and client id at /api/v1/auth/config for the web UI.
func (s *Server) UseOIDC(v *oidcauth.Verifier, issuer, clientID string) {
	s.oidc = v
	s.oidcCfg = authConfig{Enabled: true, Issuer: issuer, ClientID: clientID}
}

// Handler returns the HTTP handler.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", s.health)
	mux.HandleFunc("GET /api/v1/openapi.yaml", s.openapi)
	mux.HandleFunc("GET /api/v1/auth/config", s.authConfig)
	mux.Handle("GET /api/v1/tables", s.auth(s.listTables))
	mux.Handle("GET /api/v1/tables/{table}", s.auth(s.getTable))
	mux.Handle("GET /api/v1/{table}", s.auth(s.read))
	mux.Handle("GET /api/v1/{table}/{keys...}", s.auth(s.read))
	mux.Handle("POST /api/v1/{table}", s.auth(s.create))
	mux.Handle("PUT /api/v1/{table}/{keys...}", s.auth(s.update(true)))
	mux.Handle("PATCH /api/v1/{table}/{keys...}", s.auth(s.update(false)))
	mux.Handle("DELETE /api/v1/{table}/{keys...}", s.auth(s.remove))
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "not_found", "no such endpoint: "+r.Method+" "+r.URL.Path)
	})
	mux.Handle("/", s.ui())
	return s.logRequests(mux)
}

// ---- middleware ----

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		if strings.HasPrefix(r.URL.Path, "/api/") {
			s.log.Info("request", "method", r.Method, "path", r.URL.Path, "status", rec.status, "ms", time.Since(start).Milliseconds())
		}
	})
}

func (s *Server) authConfig(w http.ResponseWriter, r *http.Request) {
	c := s.oidcCfg
	c.TokenAuth = s.token != ""
	writeJSON(w, http.StatusOK, c)
}

// auth lets a request through when it carries the static API token or, if
// OpenID Connect is configured, a valid access token. With neither
// configured the API is open.
func (s *Server) auth(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.token != "" || s.oidc != nil {
			got, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
			if !ok || !s.allowed(r.Context(), got) {
				w.Header().Set("WWW-Authenticate", `Bearer realm="mlw"`)
				writeError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid bearer token")
				return
			}
		}
		next(w, r)
	})
}

func (s *Server) allowed(ctx context.Context, got string) bool {
	if s.token != "" {
		a, b := sha256.Sum256([]byte(got)), sha256.Sum256([]byte(s.token))
		if subtle.ConstantTimeCompare(a[:], b[:]) == 1 {
			return true
		}
	}
	if s.oidc != nil && got != "" {
		if _, err := s.oidc.Verify(ctx, got); err == nil {
			return true
		} else {
			s.log.Debug("access token rejected", "error", err)
		}
	}
	return false
}

// ---- responses ----

func writeJSON(w http.ResponseWriter, status int, v any) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		status = http.StatusInternalServerError
		buf.Reset()
		buf.WriteString(`{"error":{"code":"internal","message":"encoding the response failed"}}` + "\n")
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	w.Write(buf.Bytes())
}

func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": msg}})
}

func (s *Server) fail(w http.ResponseWriter, r *http.Request, err error) {
	var bad *store.BadRequestError
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "no row with this key")
	case errors.Is(err, store.ErrReadOnly):
		w.Header().Set("Allow", "GET, HEAD")
		writeError(w, http.StatusMethodNotAllowed, "read_only", "this table is maintained automatically and cannot be written directly")
	case errors.Is(err, store.ErrConflict):
		msg := "a row with this key already exists"
		if e := err.Error(); e != store.ErrConflict.Error() {
			msg = strings.TrimPrefix(e, store.ErrConflict.Error()+": ")
		}
		writeError(w, http.StatusConflict, "conflict", msg)
	case errors.As(err, &bad):
		writeError(w, http.StatusBadRequest, "bad_request", bad.Msg)
	case store.Kind(err) == "invalid":
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
	case store.Kind(err) == "unavailable":
		s.log.Error("cassandra unavailable", "path", r.URL.Path, "error", err)
		writeError(w, http.StatusServiceUnavailable, "unavailable", "the database is not available")
	default:
		s.log.Error("request failed", "method", r.Method, "path", r.URL.Path, "error", err)
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
	}
}

// ---- handlers ----

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if err := s.st.Ping(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable", "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "keyspace": s.st.Keyspace()})
}

type tableInfo struct {
	*store.Table
	Path string `json:"path"`
}

func info(t *store.Table) tableInfo {
	p := "/api/v1/" + t.Name
	for _, k := range t.Key() {
		p += "/{" + k + "}"
	}
	return tableInfo{t, p}
}

func (s *Server) listTables(w http.ResponseWriter, r *http.Request) {
	var out []tableInfo
	for _, t := range s.st.Tables() {
		out = append(out, info(t))
	}
	writeJSON(w, http.StatusOK, map[string]any{"keyspace": s.st.Keyspace(), "tables": out})
}

func (s *Server) table(w http.ResponseWriter, r *http.Request) (*store.Table, bool) {
	t, ok := s.st.Table(r.PathValue("table"))
	if !ok {
		writeError(w, http.StatusNotFound, "not_found", fmt.Sprintf("no table named %q", r.PathValue("table")))
	}
	return t, ok
}

func (s *Server) getTable(w http.ResponseWriter, r *http.Request) {
	if t, ok := s.table(w, r); ok {
		writeJSON(w, http.StatusOK, info(t))
	}
}

// keySegments returns the unescaped key values that follow the table name in the URL.
func keySegments(r *http.Request, table string) ([]string, error) {
	rest := strings.TrimPrefix(r.URL.EscapedPath(), "/api/v1/"+url.PathEscape(table))
	rest = strings.Trim(rest, "/")
	if rest == "" {
		return nil, nil
	}
	parts := strings.Split(rest, "/")
	for i, p := range parts {
		u, err := url.PathUnescape(p)
		if err != nil {
			return nil, &store.BadRequestError{Msg: "invalid escape in the URL"}
		}
		parts[i] = u
	}
	return parts, nil
}

func (s *Server) read(w http.ResponseWriter, r *http.Request) {
	t, ok := s.table(w, r)
	if !ok {
		return
	}
	segs, err := keySegments(r, t.Name)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	key, err := t.ParseKey(segs)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if len(key) == len(t.Key()) {
		row, err := s.st.Get(r.Context(), t, key)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, row)
		return
	}
	limit := defaultLimit
	if v := r.URL.Query().Get("limit"); v != "" {
		if limit, err = strconv.Atoi(v); err != nil || limit < 1 || limit > maxLimit {
			writeError(w, http.StatusBadRequest, "bad_request", fmt.Sprintf("limit must be between 1 and %d", maxLimit))
			return
		}
	}
	var page []byte
	if v := r.URL.Query().Get("pageState"); v != "" {
		if page, err = base64.RawURLEncoding.DecodeString(v); err != nil {
			writeError(w, http.StatusBadRequest, "bad_request", "pageState is not valid")
			return
		}
	}
	rows, next, err := s.st.List(r.Context(), t, key, limit, page)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	var nextState any
	if len(next) > 0 {
		nextState = base64.RawURLEncoding.EncodeToString(next)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": rows, "count": len(rows), "nextPageState": nextState})
}

func decodeBody(w http.ResponseWriter, r *http.Request) (map[string]any, error) {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody))
	dec.UseNumber()
	var m map[string]any
	if err := dec.Decode(&m); err != nil || m == nil {
		return nil, &store.BadRequestError{Msg: "the body must be a JSON object"}
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return nil, &store.BadRequestError{Msg: "the body must be a single JSON object"}
	}
	return m, nil
}

func location(t *store.Table, row store.Row) string {
	p := "/api/v1/" + url.PathEscape(t.Name)
	for _, k := range t.Key() {
		v, ok := row[k]
		if !ok {
			break
		}
		p += "/" + url.PathEscape(fmt.Sprint(v))
	}
	return p
}

func (s *Server) create(w http.ResponseWriter, r *http.Request) {
	t, ok := s.table(w, r)
	if !ok {
		return
	}
	body, err := decodeBody(w, r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	row, err := s.st.Create(r.Context(), t, body)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	w.Header().Set("Location", location(t, row))
	writeJSON(w, http.StatusCreated, row)
}

func (s *Server) update(replace bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		t, ok := s.table(w, r)
		if !ok {
			return
		}
		segs, err := keySegments(r, t.Name)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		key, err := t.ParseKey(segs)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		body, err := decodeBody(w, r)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		row, err := s.st.Update(r.Context(), t, key, body, replace)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, row)
	}
}

func (s *Server) remove(w http.ResponseWriter, r *http.Request) {
	t, ok := s.table(w, r)
	if !ok {
		return
	}
	segs, err := keySegments(r, t.Name)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	key, err := t.ParseKey(segs)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if err := s.st.Delete(r.Context(), t, key); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- web UI ----

// ui serves the embedded files, falling back to index.html for client-side routes.
func (s *Server) ui() http.Handler {
	files := http.FileServerFS(s.static)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if name == "" {
			name = "index.html"
		}
		if _, err := fs.Stat(s.static, name); err != nil {
			if _, err := fs.Stat(s.static, "index.html"); err != nil {
				http.Error(w, "The web UI is not built into this binary. The REST API is at /api/v1.", http.StatusNotFound)
				return
			}
			r = r.Clone(r.Context())
			r.URL.Path = "/"
		} else if strings.HasPrefix(name, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		files.ServeHTTP(w, r)
	})
}
