package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func TestKeySegments(t *testing.T) {
	cases := map[string][]string{
		"/api/v1/shot":              nil,
		"/api/v1/shot/":             nil,
		"/api/v1/shot/p/s":          {"p", "s"},
		"/api/v1/shot/p%2Fq/s%20t/": {"p/q", "s t"},
	}
	for path, want := range cases {
		r := httptest.NewRequest("GET", path, nil)
		got, err := keySegments(r, "shot")
		if err != nil || len(got) != len(want) {
			t.Errorf("%s: got %v, %v; want %v", path, got, err, want)
			continue
		}
		for i := range want {
			if got[i] != want[i] {
				t.Errorf("%s: got %v; want %v", path, got, want)
			}
		}
	}
}

func TestAuth(t *testing.T) {
	s := &Server{token: "secret"}
	h := s.auth(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	for header, want := range map[string]int{
		"":              http.StatusUnauthorized,
		"Bearer nope":   http.StatusUnauthorized,
		"Basic secret":  http.StatusUnauthorized,
		"Bearer secret": http.StatusNoContent,
	} {
		r := httptest.NewRequest("GET", "/api/v1/tables", nil)
		if header != "" {
			r.Header.Set("Authorization", header)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != want {
			t.Errorf("Authorization %q: status %d, want %d", header, w.Code, want)
		}
	}
	open := &Server{}
	w := httptest.NewRecorder()
	open.auth(func(w http.ResponseWriter, r *http.Request) {}).ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != http.StatusOK {
		t.Errorf("no token configured: status %d", w.Code)
	}
}

func TestUIFallback(t *testing.T) {
	s := &Server{static: fstest.MapFS{"index.html": {Data: []byte("<html>app</html>")}, "assets/a.js": {Data: []byte("js")}}}
	h := s.ui()
	for path, want := range map[string]int{"/": 200, "/assets/a.js": 200, "/some/route": 200} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != want {
			t.Errorf("%s: %d", path, w.Code)
		}
	}
	empty := &Server{static: fstest.MapFS{}}
	w := httptest.NewRecorder()
	empty.ui().ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != 404 {
		t.Errorf("no UI built: %d", w.Code)
	}
}
