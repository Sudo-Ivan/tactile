package server

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Sudo-Ivan/tactile/publish/internal/config"
	"github.com/Sudo-Ivan/tactile/publish/internal/protocol"
	"github.com/Sudo-Ivan/tactile/publish/internal/store"
)

// newAllowlistEnv builds a server with public access off and the given
// identity allowlisted, then swaps the env key to that identity.
func newAllowlistEnv(t *testing.T, extraAllowed string) *testEnv {
	t.Helper()
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	var pub [32]byte
	copy(pub[:], priv.Public().(ed25519.PublicKey))
	allowed := hex.EncodeToString(pub[:])
	if extraAllowed != "" {
		allowed += "," + extraAllowed
	}
	cfg := config.Default()
	cfg.PoWBits = 0
	cfg.ManifestTTL = time.Millisecond
	cfg.AllowedIdentities = allowed
	st, err := store.OpenFS(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	srv, err := New(cfg, st)
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(func() { ts.Close(); _ = srv.Close() })
	e := &testEnv{srv: srv, ts: ts, priv: priv}
	copy(e.pub[:], pub[:])
	return e
}

func listSites(e *testEnv, t *testing.T) (int, map[string]any) {
	t.Helper()
	return e.do(t, http.MethodGet, "/v1/sites", nil,
		func(ts int64) []byte { return protocol.RESTSigMessage("LIST", "", ts) }, nil)
}

func TestAllowlistPrivateByDefault(t *testing.T) {
	// Default config denies every identity: the node is operator-only
	// until an allowlist or -allow-public is set.
	e := newTestEnv(t, func(c *config.Config) { c.AllowPublic = false })
	status, body := listSites(e, t)
	if status != http.StatusForbidden || body["code"] != protocol.CodeNotAllowed {
		t.Fatalf("expected 403 not_allowed, got %d %v", status, body)
	}
	if code := e.createSite(t, "my-site"); code != http.StatusForbidden {
		t.Fatalf("expected 403 on site create, got %d", code)
	}
}

func TestAllowlistAllowedIdentity(t *testing.T) {
	e := newAllowlistEnv(t, "")
	if status, _ := listSites(e, t); status != http.StatusOK {
		t.Fatalf("allowlisted identity: expected 200, got %d", status)
	}
	if code := e.createSite(t, "my-site"); code != http.StatusCreated {
		t.Fatalf("allowlisted create: expected 201, got %d", code)
	}

	// A stranger with a valid signature is still refused.
	stranger := &testEnv{srv: e.srv, ts: e.ts}
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	stranger.priv = priv
	copy(stranger.pub[:], priv.Public().(ed25519.PublicKey))
	status, body := listSites(stranger, t)
	if status != http.StatusForbidden || body["code"] != protocol.CodeNotAllowed {
		t.Fatalf("stranger: expected 403 not_allowed, got %d %v", status, body)
	}
}

func TestAllowPublicOverridesAllowlist(t *testing.T) {
	e := newTestEnv(t, func(c *config.Config) {
		c.AllowPublic = true
		c.AllowedIdentities = ""
	})
	if status, _ := listSites(e, t); status != http.StatusOK {
		t.Fatalf("public mode: expected 200, got %d", status)
	}
}
