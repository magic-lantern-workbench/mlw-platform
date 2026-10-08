package oidcauth

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

const issuer = "http://localhost:8180/realms/mlw"

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func sign(t *testing.T, key *rsa.PrivateKey, claims map[string]any) string {
	t.Helper()
	hdr, _ := json.Marshal(map[string]string{"alg": "RS256", "typ": "JWT", "kid": "k1"})
	body, _ := json.Marshal(claims)
	in := b64(hdr) + "." + b64(body)
	h := sha256.Sum256([]byte(in))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, h[:])
	if err != nil {
		t.Fatal(err)
	}
	return in + "." + b64(sig)
}

func TestVerify(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	other, _ := rsa.GenerateKey(rand.Reader, 2048)
	jwks := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kty": "RSA", "alg": "RS256", "use": "sig", "kid": "k1",
			"n": b64(key.N.Bytes()), "e": b64(big.NewInt(int64(key.E)).Bytes()),
		}}})
	}))
	defer jwks.Close()

	claims := func(over map[string]any) map[string]any {
		c := map[string]any{
			"iss": issuer, "sub": "u1", "azp": "mlw-app", "typ": "Bearer", "preferred_username": "ann",
			"exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(),
			"realm_access": map[string]any{"roles": []string{"mlw-user"}},
		}
		for k, v := range over {
			if v == nil {
				delete(c, k)
			} else {
				c[k] = v
			}
		}
		return c
	}
	ctx := context.Background()
	plain := New(ctx, issuer, jwks.URL, "mlw-app", "")
	roled := New(ctx, issuer, jwks.URL, "mlw-app", "mlw-admin")

	cases := []struct {
		name string
		v    *Verifier
		key  *rsa.PrivateKey
		over map[string]any
		ok   bool
	}{
		{"valid", plain, key, nil, true},
		{"valid without typ", plain, key, map[string]any{"typ": nil}, true},
		{"wrong signature", plain, other, nil, false},
		{"wrong issuer", plain, key, map[string]any{"iss": "http://evil/realms/mlw"}, false},
		{"expired", plain, key, map[string]any{"exp": time.Now().Add(-time.Hour).Unix()}, false},
		{"other client", plain, key, map[string]any{"azp": "other"}, false},
		{"id token", plain, key, map[string]any{"typ": "ID"}, false},
		{"missing role", roled, key, nil, false},
		{"has role", roled, key, map[string]any{"realm_access": map[string]any{"roles": []string{"mlw-admin"}}}, true},
	}
	for _, c := range cases {
		got, err := c.v.Verify(ctx, sign(t, c.key, claims(c.over)))
		if (err == nil) != c.ok {
			t.Errorf("%s: err = %v, want ok=%v", c.name, err, c.ok)
		}
		if err == nil && got.PreferredUsername != "ann" {
			t.Errorf("%s: username %q", c.name, got.PreferredUsername)
		}
	}
	if _, err := plain.Verify(ctx, "not-a-token"); err == nil {
		t.Error("garbage accepted")
	}
}
