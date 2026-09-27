package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"math/big"
	"net/http"
	"time"
)

func (p *Provider) signingKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	age := time.Since(p.fetched)
	if key := p.keys[kid]; key != nil && age < time.Hour {
		return key, nil
	}
	// Bound unknown-key refreshes while supporting provider signing-key rotation.
	if !p.fetched.IsZero() && age < 30*time.Second {
		return nil, errResponse
	}
	var set struct {
		Keys []struct{ Kty, Use, Alg, Kid, N, E string } `json:"keys"`
	}
	if err := p.request(ctx, http.MethodGet, p.endpoints.jwks, nil, "", &set); err != nil {
		return nil, err
	}
	if len(set.Keys) == 0 || len(set.Keys) > 20 {
		return nil, errResponse
	}
	keys := map[string]*rsa.PublicKey{}
	for _, k := range set.Keys {
		if k.Kty != "RSA" || (k.Use != "" && k.Use != "sig") || (k.Alg != "" && k.Alg != "RS256") || k.Kid == "" {
			continue
		}
		if keys[k.Kid] != nil {
			return nil, errResponse
		}
		n, err := base64.RawURLEncoding.DecodeString(k.N)
		if err != nil || len(n) < 256 || len(n) > 512 {
			return nil, errResponse
		}
		e, err := base64.RawURLEncoding.DecodeString(k.E)
		if err != nil || len(e) > 4 || len(e) == 0 {
			return nil, errResponse
		}
		en := uint64(0)
		for _, v := range e {
			en = en<<8 | uint64(v)
		}
		if en < 3 || en > uint64(1<<31-1) || en%2 == 0 {
			return nil, errResponse
		}
		key := &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(en)}
		if key.N.BitLen() < 2048 {
			return nil, errResponse
		}
		keys[k.Kid] = key
	}
	p.keys, p.fetched = keys, time.Now()
	if key := keys[kid]; key != nil {
		return key, nil
	}
	return nil, errResponse
}
