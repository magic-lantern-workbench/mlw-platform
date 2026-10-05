package config

import (
	"crypto/tls"
	"testing"
)

func TestTLSSettings(t *testing.T) {
	for _, name := range []string{"TLS_CERT_FILE", "TLS_KEY_FILE", "TLS_MIN_VERSION", "CASSANDRA_USERNAME", "CASSANDRA_PASSWORD",
		"CASSANDRA_TLS_CERT_FILE", "CASSANDRA_TLS_KEY_FILE"} {
		t.Setenv(name, "")
	}
	c, err := Load()
	if err != nil || c.HTTPS() || c.MinTLSVersion != tls.VersionTLS12 {
		t.Fatalf("defaults: %+v %v", c, err)
	}

	t.Setenv("TLS_CERT_FILE", "/c.pem")
	if _, err := Load(); err == nil {
		t.Error("a certificate without a key should be rejected")
	}
	t.Setenv("TLS_KEY_FILE", "/k.pem")
	t.Setenv("TLS_MIN_VERSION", "1.3")
	c, err = Load()
	if err != nil || !c.HTTPS() || c.MinTLSVersion != tls.VersionTLS13 {
		t.Fatalf("https: %+v %v", c, err)
	}
	t.Setenv("TLS_MIN_VERSION", "1.1")
	if _, err := Load(); err == nil {
		t.Error("TLS 1.1 should be rejected")
	}
	t.Setenv("TLS_MIN_VERSION", "")

	t.Setenv("CASSANDRA_TLS_CERT_FILE", "/client.pem")
	if _, err := Load(); err == nil {
		t.Error("a client certificate without a key should be rejected")
	}
}
