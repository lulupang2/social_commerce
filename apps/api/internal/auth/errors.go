package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"regexp"
)

// Failure contains only public, static diagnostics. Upstream bodies/errors never escape.
type Failure struct {
	Status        int
	Code, Message string
}

func (e *Failure) Error() string { return e.Code }

var (
	errDB               = &Failure{503, "AUTH_DATABASE_UNAVAILABLE", "Authentication storage is unavailable"}
	errDisabled         = &Failure{503, "PROVIDER_DISABLED", "This login provider is not configured"}
	errReturnPath       = &Failure{400, "RETURN_PATH_INVALID", "The return path is not allowed"}
	errRequest          = &Failure{400, "AUTH_REQUEST_INVALID", "The authentication request is invalid"}
	errState            = &Failure{400, "STATE_INVALID", "The login state is invalid"}
	errStateExpired     = &Failure{410, "STATE_EXPIRED", "The login attempt has expired; start again"}
	errStateUsed        = &Failure{409, "STATE_REUSED", "The login attempt has already been used; start again"}
	errBrowser          = &Failure{400, "BROWSER_MISMATCH", "The login attempt belongs to a different browser"}
	errProviderMismatch = &Failure{400, "PROVIDER_MISMATCH", "The login provider does not match"}
	errDenied           = &Failure{403, "OAUTH_DENIED", "Login consent was declined"}
	errCode             = &Failure{400, "OAUTH_CODE_INVALID", "The authorization code is invalid or already used"}
	errProvider         = &Failure{503, "OAUTH_UNAVAILABLE", "The login provider is unavailable; start again later"}
	errTimeout          = &Failure{504, "OAUTH_TIMEOUT", "The login provider did not respond in time; start again"}
	errResponse         = &Failure{502, "OAUTH_RESPONSE_INVALID", "The login provider response could not be verified"}
	errUnauthorized     = &Failure{401, "UNAUTHENTICATED", "A valid service session is required"}
	errAccount          = &Failure{403, "ACCOUNT_UNAVAILABLE", "This member account cannot sign in"}
	errCSRF             = &Failure{403, "CSRF_INVALID", "The request could not be verified"}
	errOrigin           = &Failure{403, "ORIGIN_INVALID", "The request origin is not allowed"}
	errReauth           = &Failure{403, "REAUTH_REQUIRED", "Reauthenticate before signing out every device"}
	errIdentity         = &Failure{403, "REAUTH_IDENTITY_MISMATCH", "Reauthenticate with the same member account"}
	errRate             = &Failure{429, "AUTH_RATE_LIMITED", "Too many authentication requests; try again later"}
)

func PublicFailure(err error) *Failure {
	var f *Failure
	if errors.As(err, &f) {
		return f
	}
	return errDB
}
func publicFailure(err error) *Failure { return PublicFailure(err) }
func randomToken() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", errDB
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}
func hashToken(v string) string { s := sha256.Sum256([]byte(v)); return hex.EncodeToString(s[:]) }
func csrfToken(v string) string {
	s := sha256.Sum256([]byte("summergear-csrf-v1:" + v))
	return base64.RawURLEncoding.EncodeToString(s[:])
}
func pkceChallenge(v string) string {
	s := sha256.Sum256([]byte(v))
	return base64.RawURLEncoding.EncodeToString(s[:])
}

var tokenPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

func validToken(v string) bool {
	if !tokenPattern.MatchString(v) {
		return false
	}
	b, err := base64.RawURLEncoding.DecodeString(v)
	return err == nil && len(b) == 32 && base64.RawURLEncoding.EncodeToString(b) == v
}
func equal(a, b string) bool { return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1 }
