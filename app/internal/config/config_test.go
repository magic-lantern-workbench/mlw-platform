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

func TestOIDCSettings(t *testing.T) {
	for _, name := range []string{"OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_JWKS_URL", "OIDC_REQUIRED_ROLE"} {
		t.Setenv(name, "")
	}
	c, err := Load()
	if err != nil || c.OIDC() || c.OIDCClientID != "mlw-app" {
		t.Fatalf("defaults: %+v %v", c, err)
	}
	t.Setenv("OIDC_ISSUER", "http://localhost:8180/realms/mlw/")
	c, err = Load()
	if err != nil || !c.OIDC() || c.OIDCIssuer != "http://localhost:8180/realms/mlw" ||
		c.OIDCJWKSURL != "http://localhost:8180/realms/mlw/protocol/openid-connect/certs" {
		t.Fatalf("issuer only: %+v %v", c, err)
	}
	t.Setenv("OIDC_JWKS_URL", "http://keycloak:8080/realms/mlw/protocol/openid-connect/certs")
	if c, _ = Load(); c.OIDCJWKSURL != "http://keycloak:8080/realms/mlw/protocol/openid-connect/certs" {
		t.Errorf("explicit jwks url: %s", c.OIDCJWKSURL)
	}
}
