package server

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"testing"

	"github.com/Sudo-Ivan/tactile/relay/internal/blob"
	"github.com/Sudo-Ivan/tactile/relay/internal/config"
)

func restPut(t *testing.T, tsURL string, priv ed25519.PrivateKey, payload []byte) *http.Response {
	t.Helper()
	var id [32]byte
	rand.Read(id[:])
	ttl := int64(600)
	req, _ := http.NewRequest(http.MethodPut, tsURL+"/v1/blobs", bytes.NewReader(payload))
	req.Header.Set(hdrIdentity, base64.StdEncoding.EncodeToString(priv.Public().(ed25519.PublicKey)))
	req.Header.Set(hdrBlobID, base64.StdEncoding.EncodeToString(id[:]))
	req.Header.Set(hdrTTL, fmt.Sprint(ttl))
	req.Header.Set(hdrSig, base64.StdEncoding.EncodeToString(ed25519.Sign(priv, blob.SigMessage(id, ttl, payload))))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func TestAllowlistDeniesStrangers(t *testing.T) {
	cfg := testConfig(t)
	cfg.AllowPublic = false
	_, ts := newTestServer(t, cfg)

	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	res := restPut(t, ts.URL, priv, []byte("payload"))
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("private relay accepted stranger: %d", res.StatusCode)
	}
}

func TestAllowlistAdmitsListedIdentity(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	cfg := testConfig(t)
	cfg.AllowPublic = false
	cfg.AllowedIdentities = hex.EncodeToString(pub)
	_, ts := newTestServer(t, cfg)

	res := restPut(t, ts.URL, priv, []byte("payload"))
	res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("allowlisted identity denied: %d", res.StatusCode)
	}
}

func TestAllowPublicDefault(t *testing.T) {
	cfg := testConfig(t)
	_, ts := newTestServer(t, cfg)

	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	res := restPut(t, ts.URL, priv, []byte("payload"))
	res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("public relay denied identity: %d", res.StatusCode)
	}
}

func TestAllowedSetBadKey(t *testing.T) {
	cfg := config.Config{AllowedIdentities: "not-hex"}
	if _, err := cfg.AllowedSet(); err == nil {
		t.Fatal("expected error on malformed identity")
	}
}
