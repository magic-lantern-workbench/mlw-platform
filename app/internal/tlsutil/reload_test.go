package tlsutil

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"io"
	"log/slog"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writePair(t *testing.T, dir, cn string) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	tpl := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject:      pkix.Name{CommonName: cn},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		DNSNames:     []string{"localhost"},
	}
	der, err := x509.CreateCertificate(rand.Reader, tpl, tpl, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	write := func(name, typ string, b []byte) {
		if err := os.WriteFile(filepath.Join(dir, name), pem.EncodeToMemory(&pem.Block{Type: typ, Bytes: b}), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write("cert.pem", "CERTIFICATE", der)
	write("key.pem", "EC PRIVATE KEY", keyDER)
}

func commonName(t *testing.T, r *Reloader) string {
	t.Helper()
	c, err := r.GetCertificate(nil)
	if err != nil {
		t.Fatal(err)
	}
	leaf, err := x509.ParseCertificate(c.Certificate[0])
	if err != nil {
		t.Fatal(err)
	}
	return leaf.Subject.CommonName
}

func TestReloader(t *testing.T) {
	dir := t.TempDir()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	writePair(t, dir, "first")
	r, err := NewReloader(filepath.Join(dir, "cert.pem"), filepath.Join(dir, "key.pem"), log)
	if err != nil {
		t.Fatal(err)
	}
	if got := commonName(t, r); got != "first" {
		t.Fatalf("got %q", got)
	}

	// a renewed certificate is picked up once the recheck interval has passed
	writePair(t, dir, "second")
	future := time.Now().Add(time.Minute)
	os.Chtimes(filepath.Join(dir, "cert.pem"), future, future)
	os.Chtimes(filepath.Join(dir, "key.pem"), future, future)
	r.checked = time.Time{}
	if got := commonName(t, r); got != "second" {
		t.Fatalf("after renewal got %q", got)
	}

	// a broken replacement keeps the certificate that works
	os.WriteFile(filepath.Join(dir, "cert.pem"), []byte("garbage"), 0o600)
	later := future.Add(time.Minute)
	os.Chtimes(filepath.Join(dir, "cert.pem"), later, later)
	r.checked = time.Time{}
	if got := commonName(t, r); got != "second" {
		t.Fatalf("after a broken reload got %q", got)
	}
}

func TestNewReloaderFailsOnBadFiles(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	if _, err := NewReloader("/nonexistent/cert.pem", "/nonexistent/key.pem", log); err == nil {
		t.Fatal("want an error for missing files")
	}
}
