// Package tier implements stateless paid-tier tokens. An operator mints
// tokens offline with an HMAC secret; the relay verifies the signature and
// applies the tier limits embedded by reference. There is no user database:
// the token is self-validating, which is what lets independent operators
// run their own paid relays with their own secrets.
package tier

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Tier is a named set of resource limits. Zero fields mean "unrestricted
// by this knob" and fall back to the relay's global defaults.
type Tier struct {
	QuotaBytes    int64 `json:"quota_bytes"`     // per-identity storage cap
	MaxTTLSeconds int64 `json:"max_ttl_seconds"` // max blob retention
	MaxBlobBytes  int64 `json:"max_blob_bytes"`  // max blob size
}

// Errors returned by Verify.
var (
	ErrMalformed = errors.New("tier: malformed token")
	ErrBadSig    = errors.New("tier: bad token signature")
	ErrExpired   = errors.New("tier: token expired")
	ErrBadTier   = errors.New("tier: unknown tier")
)

type payload struct {
	Tier string `json:"t"`
	Exp  int64  `json:"e"`
	JTI  string `json:"j,omitempty"` // random id; lets operators revoke lists of tokens
}

// Defaults is the built-in tier table. Operators override it with a tiers
// file. Field values chosen to be a sane first paid scheme: free is the
// historical default, supporter roughly quadruples capacity, pro is for
// heavy vaults.
var Defaults = map[string]Tier{
	"free":      {QuotaBytes: 64 << 20, MaxTTLSeconds: 30 * 86400, MaxBlobBytes: 1 << 20},
	"supporter": {QuotaBytes: 256 << 20, MaxTTLSeconds: 90 * 86400, MaxBlobBytes: 4 << 20},
	"pro":       {QuotaBytes: 1 << 30, MaxTTLSeconds: 365 * 86400, MaxBlobBytes: 8 << 20},
}

// LoadTiers reads a tiers JSON file: {"name": {"quota_bytes":N,...}}.
// Returns Defaults when path is empty.
func LoadTiers(path string) (map[string]Tier, error) {
	if path == "" {
		return Defaults, nil
	}
	data, err := os.ReadFile(filepath.Clean(path)) // #nosec G304 -- operator-supplied config path
	if err != nil {
		return nil, err
	}
	var m map[string]Tier
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("tier: parse %s: %w", path, err)
	}
	if len(m) == 0 {
		return nil, errors.New("tier: tiers file is empty")
	}
	if _, ok := m["free"]; !ok {
		return nil, errors.New("tier: tiers file must define a free tier")
	}
	for name, t := range m {
		if t.QuotaBytes <= 0 || t.MaxTTLSeconds <= 0 || t.MaxBlobBytes <= 0 {
			return nil, fmt.Errorf("tier: %q has non-positive limits", name)
		}
	}
	return m, nil
}

// Mint issues a token for tierName valid for validFor from now.
// Format: base64url(payload).base64url(hmac-sha256(secret, payload)).
func Mint(secret []byte, tierName string, validFor time.Duration) (string, error) {
	var jti [8]byte
	if _, err := rand.Read(jti[:]); err != nil {
		return "", err
	}
	p, err := json.Marshal(payload{
		Tier: tierName,
		Exp:  time.Now().Add(validFor).Unix(),
		JTI:  fmt.Sprintf("%x", jti[:]),
	})
	if err != nil {
		return "", err
	}
	enc := base64.RawURLEncoding
	return enc.EncodeToString(p) + "." + enc.EncodeToString(sign(secret, p)), nil
}

// Verify checks a token's signature and expiry, returning the tier name.
// secrets supports rotation: every secret is tried until one validates.
func Verify(secrets [][]byte, token string, now int64) (string, error) {
	enc := base64.RawURLEncoding
	dot := 0
	for i := len(token) - 1; i >= 0; i-- {
		if token[i] == '.' {
			dot = i
			break
		}
	}
	if dot == 0 {
		return "", ErrMalformed
	}
	raw, err := enc.DecodeString(token[:dot])
	if err != nil {
		return "", ErrMalformed
	}
	sig, err := enc.DecodeString(token[dot+1:])
	if err != nil {
		return "", ErrMalformed
	}
	ok := false
	for _, s := range secrets {
		if hmac.Equal(sig, sign(s, raw)) {
			ok = true
			break
		}
	}
	if !ok {
		return "", ErrBadSig
	}
	var p payload
	if err := json.Unmarshal(raw, &p); err != nil {
		return "", ErrMalformed
	}
	if p.Exp <= now {
		return "", ErrExpired
	}
	if p.Tier == "" {
		return "", ErrBadTier
	}
	return p.Tier, nil
}

func sign(secret, p []byte) []byte {
	h := hmac.New(sha256.New, secret)
	h.Write(p)
	return h.Sum(nil)
}
