package server

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/Sudo-Ivan/tactile/publish/internal/config"
	"github.com/Sudo-Ivan/tactile/publish/internal/identity"
	"github.com/Sudo-Ivan/tactile/publish/internal/protocol"
	"github.com/Sudo-Ivan/tactile/publish/internal/store"
)

type testEnv struct {
	srv  *Server
	ts   *httptest.Server
	priv ed25519.PrivateKey
	pub  [32]byte
}

func newTestEnv(t *testing.T, mutate func(*config.Config)) *testEnv {
	t.Helper()
	cfg := config.Default()
	cfg.PoWBits = 0 // tests sign; PoW is exercised separately
	cfg.ManifestTTL = time.Millisecond
	if mutate != nil {
		mutate(&cfg)
	}
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
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	e := &testEnv{srv: srv, ts: ts, priv: priv}
	copy(e.pub[:], priv.Public().(ed25519.PublicKey))
	return e
}

func (e *testEnv) do(t *testing.T, method, url string, body []byte, msgFor func(ts int64) []byte, extra map[string]string) (int, map[string]any) {
	t.Helper()
	ts := time.Now().Unix()
	var rd io.Reader
	if body != nil {
		rd = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, e.ts.URL+url, rd)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("X-Tactile-Identity", base64.StdEncoding.EncodeToString(e.pub[:]))
	req.Header.Set("X-Tactile-Timestamp", strconv.FormatInt(ts, 10))
	req.Header.Set("X-Tactile-Signature",
		base64.StdEncoding.EncodeToString(ed25519.Sign(e.priv, msgFor(ts))))
	for k, v := range extra {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	b, _ := io.ReadAll(res.Body)
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	return res.StatusCode, m
}

func siteTar(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for name, content := range files {
		if err := tw.WriteHeader(&tar.Header{Name: name, Typeflag: tar.TypeReg, Mode: 0o644, Size: int64(len(content))}); err != nil {
			t.Fatal(err)
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	_ = tw.Close()
	_ = gz.Close()
	return buf.Bytes()
}

func (e *testEnv) createSite(t *testing.T, slug string) int {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"title": "T"})
	code, _ := e.do(t, "PUT", "/v1/sites/"+slug, body,
		func(ts int64) []byte { return protocol.SiteSigMessage(slug, ts) }, nil)
	return code
}

func (e *testEnv) deploy(t *testing.T, slug string, bundle []byte) (int, map[string]any) {
	t.Helper()
	sum := sha256.Sum256(bundle)
	return e.do(t, "POST", "/v1/sites/"+slug+"/deploys", bundle,
		func(ts int64) []byte { return protocol.DeploySigMessage(slug, sum, ts) }, nil)
}

func TestInfoHealth(t *testing.T) {
	e := newTestEnv(t, nil)
	res, err := http.Get(e.ts.URL + "/v1/info")
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	_ = json.NewDecoder(res.Body).Decode(&m)
	_ = res.Body.Close()
	if m["node_id"] == "" || m["version"].(float64) != 1 {
		t.Fatalf("bad info: %v", m)
	}
	res, _ = http.Get(e.ts.URL + "/v1/health")
	if res.StatusCode != 200 {
		t.Fatal("health not ok")
	}
	_ = res.Body.Close()
}

func TestCreateDeployServePath(t *testing.T) {
	e := newTestEnv(t, nil)
	if code := e.createSite(t, "blog"); code != http.StatusCreated {
		t.Fatalf("create: %d", code)
	}
	b := siteTar(t, map[string]string{
		"index.html": "<h1>hello</h1>",
		"about.html": "<h1>about</h1>",
		"style.css":  "body{}",
	})
	code, m := e.deploy(t, "blog", b)
	if code != http.StatusCreated {
		t.Fatalf("deploy: %d %v", code, m)
	}
	if m["deploy_id"] == "" {
		t.Fatal("no deploy id")
	}

	// Path-mode serving.
	res, err := http.Get(e.ts.URL + "/s/blog/")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	_ = res.Body.Close()
	if res.StatusCode != 200 || string(body) != "<h1>hello</h1>" {
		t.Fatalf("serve: %d %q", res.StatusCode, body)
	}
	if res.Header.Get("Content-Type") != "text/html; charset=utf-8" {
		t.Fatalf("bad mime %q", res.Header.Get("Content-Type"))
	}
	// Clean URL.
	res, _ = http.Get(e.ts.URL + "/s/blog/about")
	body, _ = io.ReadAll(res.Body)
	_ = res.Body.Close()
	if string(body) != "<h1>about</h1>" {
		t.Fatalf("clean url: %q", body)
	}
	// ETag revalidation.
	etag := res.Header.Get("ETag")
	req, _ := http.NewRequest("GET", e.ts.URL+"/s/blog/about", nil)
	req.Header.Set("If-None-Match", etag)
	res, _ = http.DefaultClient.Do(req)
	_ = res.Body.Close()
	if res.StatusCode != http.StatusNotModified {
		t.Fatalf("etag: %d", res.StatusCode)
	}
	// Unknown path -> 404.
	res, _ = http.Get(e.ts.URL + "/s/blog/missing")
	_ = res.Body.Close()
	if res.StatusCode != 404 {
		t.Fatal("want 404")
	}
}

func TestHostMode(t *testing.T) {
	e := newTestEnv(t, func(c *config.Config) { c.BaseDomain = "example.test" })
	e.createSite(t, "blog")
	e.deploy(t, "blog", siteTar(t, map[string]string{"index.html": "hi"}))
	req, _ := http.NewRequest("GET", e.ts.URL+"/", nil)
	req.Host = "blog.example.test"
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	_ = res.Body.Close()
	if string(body) != "hi" {
		t.Fatalf("host serving: %q", body)
	}
	// Apex -> landing.
	req, _ = http.NewRequest("GET", e.ts.URL+"/", nil)
	req.Host = "example.test"
	res, _ = http.DefaultClient.Do(req)
	var m map[string]any
	_ = json.NewDecoder(res.Body).Decode(&m)
	_ = res.Body.Close()
	if m["service"] != "tactile-publish" {
		t.Fatalf("apex: %v", m)
	}
}

func TestAuthAndOwnership(t *testing.T) {
	e := newTestEnv(t, nil)
	e.createSite(t, "blog")

	// Bad signature rejected.
	req, _ := http.NewRequest("PUT", e.ts.URL+"/v1/sites/evil", bytes.NewReader([]byte(`{}`)))
	req.Header.Set("X-Tactile-Identity", base64.StdEncoding.EncodeToString(e.pub[:]))
	req.Header.Set("X-Tactile-Timestamp", strconv.FormatInt(time.Now().Unix(), 10))
	req.Header.Set("X-Tactile-Signature", base64.StdEncoding.EncodeToString(make([]byte, 64)))
	res, _ := http.DefaultClient.Do(req)
	_ = res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("bad sig accepted: %d", res.StatusCode)
	}

	// A second identity cannot touch the first's site.
	_, priv2, _ := ed25519.GenerateKey(rand.Reader)
	var pub2 [32]byte
	copy(pub2[:], priv2.Public().(ed25519.PublicKey))
	ts := time.Now().Unix()
	req, _ = http.NewRequest("DELETE", e.ts.URL+"/v1/sites/blog", nil)
	req.Header.Set("X-Tactile-Identity", base64.StdEncoding.EncodeToString(pub2[:]))
	req.Header.Set("X-Tactile-Timestamp", strconv.FormatInt(ts, 10))
	req.Header.Set("X-Tactile-Signature",
		base64.StdEncoding.EncodeToString(ed25519.Sign(priv2, protocol.DelSigMessage("blog", ts))))
	res, _ = http.DefaultClient.Do(req)
	_ = res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("foreign delete: %d", res.StatusCode)
	}
}

func TestRollback(t *testing.T) {
	e := newTestEnv(t, nil)
	e.createSite(t, "blog")
	_, m1 := e.deploy(t, "blog", siteTar(t, map[string]string{"index.html": "v1"}))
	e.deploy(t, "blog", siteTar(t, map[string]string{"index.html": "v2"}))
	res, _ := http.Get(e.ts.URL + "/s/blog/")
	body, _ := io.ReadAll(res.Body)
	_ = res.Body.Close()
	if string(body) != "v2" {
		t.Fatal("v2 not live")
	}
	dep1 := m1["deploy_id"].(string)
	body2, _ := json.Marshal(map[string]string{"deploy_id": dep1})
	code, _ := e.do(t, "POST", "/v1/sites/blog/rollback", body2,
		func(ts int64) []byte { return protocol.RESTSigMessage("ROLLBACK", "blog|"+dep1, ts) }, nil)
	if code != 200 {
		t.Fatalf("rollback: %d", code)
	}
	time.Sleep(5 * time.Millisecond) // manifest TTL
	res, _ = http.Get(e.ts.URL + "/s/blog/")
	body, _ = io.ReadAll(res.Body)
	_ = res.Body.Close()
	if string(body) != "v1" {
		t.Fatalf("rollback serve: %q", body)
	}
}

func TestDomainVerifyFlow(t *testing.T) {
	e := newTestEnv(t, nil)
	e.createSite(t, "blog")

	body, _ := json.Marshal(map[string]string{"domain": "notes.example.com"})
	code, m := e.do(t, "POST", "/v1/sites/blog/domains", body,
		func(ts int64) []byte { return protocol.RESTSigMessage("DOMAIN", "blog|notes.example.com", ts) }, nil)
	if code != 200 {
		t.Fatalf("add domain: %d %v", code, m)
	}
	txt := m["txt_value"].(string)
	if m["txt_name"] != "_tactile-verify.notes.example.com" {
		t.Fatalf("bad txt name: %v", m)
	}

	// Inject a resolver that answers with the expected TXT.
	origLookup := lookupTXT
	lookupTXT = func(_ *net.Resolver, _ string) ([]string, error) {
		return []string{txt}, nil
	}
	defer func() { lookupTXT = origLookup }()

	code, m = e.do(t, "POST", "/v1/sites/blog/domains/verify", body,
		func(ts int64) []byte { return protocol.RESTSigMessage("DOMAIN_VERIFY", "blog|notes.example.com", ts) }, nil)
	if code != 200 || m["verified"] != true {
		t.Fatalf("verify: %d %v", code, m)
	}

	// Custom-domain host now serves the site.
	e.deploy(t, "blog", siteTar(t, map[string]string{"index.html": "domained"}))
	req, _ := http.NewRequest("GET", e.ts.URL+"/", nil)
	req.Host = "notes.example.com"
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(res.Body)
	_ = res.Body.Close()
	if string(got) != "domained" {
		t.Fatalf("domain serving: %q", got)
	}
}

func TestReadOnly(t *testing.T) {
	e := newTestEnv(t, func(c *config.Config) { c.ReadOnly = true })
	if code := e.createSite(t, "blog"); code != http.StatusForbidden {
		t.Fatalf("write on read-only: %d", code)
	}
}

func TestPoWCheck(t *testing.T) {
	e := newTestEnv(t, func(c *config.Config) { c.PoWBits = 8 })
	// Mine a nonce against the current window challenge.
	widx := time.Now().Unix() / int64(e.srv.cfg.PoWWindow.Seconds())
	ch := e.srv.powChallenge(widx)
	var nonce [16]byte
	tries := 0
	for {
		_, _ = rand.Read(nonce[:])
		tries++
		if identity.CheckPoW(ch, e.pub, nonce[:], 8) {
			break
		}
		if tries > 1<<24 {
			t.Fatal("pow mining stuck")
		}
	}
	if !e.srv.checkPoW(e.pub, nonce[:]) {
		t.Fatal("pow rejected valid nonce")
	}
	if e.srv.checkPoW(e.pub, []byte("badnoncebadnonce00")) {
		t.Fatal("pow accepted bad nonce")
	}
}
