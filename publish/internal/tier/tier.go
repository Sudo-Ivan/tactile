// Package tier implements stateless paid-tier tokens. An operator mints
// tokens offline with an HMAC secret; the node verifies the signature and
// applies the tier limits embedded by reference. There is no user database:
// the token is self-validating, which is what lets independent operators
// run their own paid publish nodes with their own secrets.
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

// Tier is a named set of resource limits. The free tier also defines the
// limits applied when paid tiers are disabled entirely.
type Tier struct {
	QuotaBytes     int64 `json:"quota_bytes"`      // per-identity storage cap
	MaxSites       int   `json:"max_sites"`        // sites an identity may claim
	MaxDomains     int   `json:"max_domains"`      // verified custom domains per identity
	MaxSiteBytes   int64 `json:"max_site_bytes"`   // extracted bytes per deploy
	MaxFileBytes   int64 `json:"max_file_bytes"`   // per-file cap inside a bundle
	MaxFiles       int   `json:"max_files"`        // files per deploy
	MaxBundleBytes int64 `json:"max_bundle_bytes"` // compressed upload cap
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
// file. Publishing is a paid feature on hosted nodes, so free gets a
// minimal trial allowance; supporter and pro share the plan storage
// limits advertised for sync.
var Defaults = map[string]Tier{
	"free": {
		QuotaBytes: 256 << 20, MaxSites: 1, MaxDomains: 0,
		MaxSiteBytes: 256 << 20, MaxFileBytes: 16 << 20, MaxFiles: 500,
		MaxBundleBytes: 64 << 20,
	},
	"supporter": {
		QuotaBytes: 100 << 30, MaxSites: 10, MaxDomains: 10,
		MaxSiteBytes: 5 << 30, MaxFileBytes: 64 << 20, MaxFiles: 25000,
		MaxBundleBytes: 512 << 20,
	},
	"pro": {
		QuotaBytes: 500 << 30, MaxSites: 100, MaxDomains: 100,
		MaxSiteBytes: 25 << 30, MaxFileBytes: 256 << 20, MaxFiles: 100000,
		MaxBundleBytes: 2 << 30,
	},
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
		if t.QuotaBytes <= 0 || t.MaxSites <= 0 || t.MaxSiteBytes <= 0 ||
			t.MaxFileBytes <= 0 || t.MaxFiles <= 0 || t.MaxBundleBytes <= 0 {
			return nil, fmt.Errorf("tier: %q has non-positive limits", name)
		}
		if t.MaxDomains < 0 {
			return nil, fmt.Errorf("tier: %q has negative max_domains", name)
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
