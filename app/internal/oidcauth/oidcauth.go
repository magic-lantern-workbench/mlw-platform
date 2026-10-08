// Package oidcauth validates access tokens issued by an OpenID Connect
// provider such as Keycloak.
package oidcauth

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"github.com/coreos/go-oidc/v3/oidc"
)

// Verifier checks the signature, issuer, expiry and client of access tokens.
type Verifier struct {
	v        *oidc.IDTokenVerifier
	clientID string
	role     string
}

// Claims are the token claims the application uses.
type Claims struct {
	Subject           string `json:"sub"`
	PreferredUsername string `json:"preferred_username"`
	AuthorizedParty   string `json:"azp"`
	Type              string `json:"typ"`
	RealmAccess       struct {
		Roles []string `json:"roles"`
	} `json:"realm_access"`
}

// New creates a Verifier. issuer is the exact value of the iss claim (the
// public URL of the realm, as seen by browsers). Keys are fetched from jwksURL,
// which can be an internal address of the provider. Tokens must have been
// issued to clientID and, when role is not empty, carry that realm role.
func New(ctx context.Context, issuer, jwksURL, clientID, role string) *Verifier {
	keys := oidc.NewRemoteKeySet(ctx, jwksURL)
	return &Verifier{
		v: oidc.NewVerifier(issuer, keys, &oidc.Config{
			// Keycloak access tokens name the client in azp, not aud
			SkipClientIDCheck:    true,
			SupportedSigningAlgs: []string{oidc.RS256, oidc.ES256},
		}),
		clientID: clientID,
		role:     role,
	}
}

// Verify checks a raw access token and returns its claims.
func (v *Verifier) Verify(ctx context.Context, raw string) (*Claims, error) {
	tok, err := v.v.Verify(ctx, raw)
	if err != nil {
		return nil, err
	}
	var c Claims
	if err := tok.Claims(&c); err != nil {
		return nil, err
	}
	// an ID token has the same signature and issuer but is not meant for APIs
	if c.Type != "" && c.Type != "Bearer" {
		return nil, fmt.Errorf("token type %q is not an access token", c.Type)
	}
	if c.AuthorizedParty != v.clientID {
		return nil, fmt.Errorf("token was issued to client %q, not %q", c.AuthorizedParty, v.clientID)
	}
	if v.role != "" && !slices.Contains(c.RealmAccess.Roles, v.role) {
		return nil, errors.New("token does not have the required role " + v.role)
	}
	return &c, nil
}
