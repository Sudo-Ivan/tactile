package server

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Sudo-Ivan/tactile/relay/internal/blob"
	"github.com/Sudo-Ivan/tactile/relay/internal/config"
	"github.com/Sudo-Ivan/tactile/relay/internal/tier"
)

const testSecret = "relay-op-secret"

func paidConfig(t *testing.T) config.Config {
	t.Helper()
	cfg := testConfig(t)
	cfg.TokenSecrets = testSecret
	// Free tier caps blobs at 16 bytes; pro allows 1 MiB.
	dir := t.TempDir()
	cfg.TiersFile = filepath.Join(dir, "tiers.json")
	err := os.WriteFile(cfg.TiersFile, []byte(`{
		"free": {"quota_bytes": 67108864, "max_ttl_seconds": 2592000, "max_blob_bytes": 16},
		"pro":  {"quota_bytes": 1073741824, "max_ttl_seconds": 31536000, "max_blob_bytes": 1048576}
	}`), 0o600)
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

func restPut(t *testing.T, tsURL, token string, payload []byte) *http.Response {
	t.Helper()
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	var id [32]byte
	rand.Read(id[:])
	ttl := int64(600)
	req, _ := http.NewRequest(http.MethodPut, tsURL+"/v1/blobs", bytes.NewReader(payload))
	req.Header.Set(hdrIdentity, base64.StdEncoding.EncodeToString(pub))
	req.Header.Set(hdrBlobID, base64.StdEncoding.EncodeToString(id[:]))
	req.Header.Set(hdrTTL, fmt.Sprint(ttl))
	req.Header.Set(hdrSig, base64.StdEncoding.EncodeToString(ed25519.Sign(priv, blob.SigMessage(id, ttl, payload))))
	if token != "" {
		req.Header.Set(hdrToken, token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func TestPaidTierBlobSize(t *testing.T) {
	_, ts := newTestServer(t, paidConfig(t))
	payload := []byte("this payload exceeds the free tier sixteen bytes")

	// No token: free tier rejects the oversized blob.
	res := restPut(t, ts.URL, "", payload)
	res.Body.Close()
	if res.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("free put: %d", res.StatusCode)
	}

	// Pro token allows it.
	tok, err := tier.Mint([]byte(testSecret), "pro", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	res = restPut(t, ts.URL, tok, payload)
	res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("pro put: %d", res.StatusCode)
	}
}

func TestBadAndExpiredTokens(t *testing.T) {
	_, ts := newTestServer(t, paidConfig(t))
	payload := []byte("x")

	res := restPut(t, ts.URL, "not.a.token", payload)
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("bad token: %d", res.StatusCode)
	}

	tok, _ := tier.Mint([]byte(testSecret), "pro", time.Second)
	time.Sleep(1100 * time.Millisecond)
	res = restPut(t, ts.URL, tok, payload)
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("expired token: %d", res.StatusCode)
	}

	// A token for a tier not in the table is rejected, not downgraded.
	tok, _ = tier.Mint([]byte(testSecret), "enterprise", time.Hour)
	res = restPut(t, ts.URL, tok, payload)
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("unknown tier: %d", res.StatusCode)
	}
}

func TestPaidOffIgnoresTokens(t *testing.T) {
	// No secrets configured: paid features fully off, everything free.
	_, ts := newTestServer(t, testConfig(t))
	res := restPut(t, ts.URL, "any.garbage.token", []byte("x"))
	res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("unpaid relay rejected token-bearing request: %d", res.StatusCode)
	}
}

func TestUAWhitelist(t *testing.T) {
	cfg := testConfig(t)
	cfg.UAWhitelist = "Tactile/"
	_, ts := newTestServer(t, cfg)

	// API requires a matching UA.
	req, _ := http.NewRequest(http.MethodPut, ts.URL+"/v1/blobs", nil)
	req.Header.Set("User-Agent", "scraper-bot/9.9")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("scraper UA: %d", res.StatusCode)
	}

	// Real client UA passes the gate (fails later on missing headers, not 403).
	req, _ = http.NewRequest(http.MethodPut, ts.URL+"/v1/blobs", nil)
	req.Header.Set("User-Agent", "Tactile/1.2")
	res, _ = http.DefaultClient.Do(req)
	res.Body.Close()
	if res.StatusCode == http.StatusForbidden {
		t.Fatal("whitelisted UA blocked")
	}

	// Info and health stay open for monitoring and client probing.
	for _, path := range []string{"/v1/info", "/v1/health"} {
		res, err = http.Get(ts.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = io.Copy(io.Discard, res.Body)
		res.Body.Close()
		if res.StatusCode != http.StatusOK {
			t.Fatalf("%s blocked: %d", path, res.StatusCode)
		}
	}
}
