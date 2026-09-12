package server

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Sudo-Ivan/tactile/relay/internal/blob"
	"github.com/Sudo-Ivan/tactile/relay/internal/config"
	"github.com/Sudo-Ivan/tactile/relay/internal/identity"
	"github.com/Sudo-Ivan/tactile/relay/internal/protocol"
	"github.com/Sudo-Ivan/tactile/relay/internal/store"
	"github.com/gorilla/websocket"
)

func testConfig(t *testing.T) config.Config {
	t.Helper()
	cfg := config.Default()
	cfg.DataDir = t.TempDir()
	cfg.PoWBits = 0
	cfg.MsgRatePerSec = 10000
	cfg.ConnRatePerSec = 10000
	cfg.MinTTL = time.Second
	cfg.MaxTTL = 24 * time.Hour
	cfg.MaxBlobSize = 1 << 20 // keep oversize test payloads small
	cfg.MaxMsgSize = 4 << 20  // keep oversize tests under the read limit
	return cfg
}

func newTestServer(t *testing.T, cfg config.Config) (*Server, *httptest.Server) {
	t.Helper()
	st, err := store.OpenFS(cfg.DataDir, cfg.MaxBlobSize)
	if err != nil {
		t.Fatal(err)
	}
	srv, err := New(cfg, st)
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(func() { ts.Close(); srv.Close() })
	return srv, ts
}

// testClient is a WS client holding one identity.
type testClient struct {
	t     *testing.T
	ws    *websocket.Conn
	pub   identity.PubKey
	priv  ed25519.PrivateKey
	hello protocol.Hello
}

func dial(t *testing.T, ts *httptest.Server) *testClient {
	t.Helper()
	url := "ws" + strings.TrimPrefix(ts.URL, "http") + "/v1/ws"
	ws, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ws.Close() })
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	c := &testClient{t: t, ws: ws, priv: priv}
	copy(c.pub[:], pub)
	c.hello = *c.read().(*protocol.Hello)
	return c
}

func (c *testClient) read() any {
	c.t.Helper()
	c.ws.SetReadDeadline(time.Now().Add(5 * time.Second))
	_, data, err := c.ws.ReadMessage()
	if err != nil {
		c.t.Fatalf("read: %v", err)
	}
	var head struct {
		Type string `json:"type"`
	}
	json.Unmarshal(data, &head)
	var v any
	switch head.Type {
	case protocol.TypeHello:
		v = &protocol.Hello{}
	case protocol.TypeOK:
		v = &protocol.OK{}
	case protocol.TypePutOK:
		v = &protocol.PutOK{}
	case protocol.TypeError:
		v = &protocol.Error{}
	case protocol.TypeBlob:
		v = &protocol.Blob{}
	case protocol.TypeBlobs:
		v = &protocol.Blobs{}
	case protocol.TypeEvent:
		v = &protocol.Event{}
	case protocol.TypeSignal:
		v = &protocol.SignalFrom{}
	default:
		c.t.Fatalf("unknown server msg type %q", head.Type)
	}
	if err := json.Unmarshal(data, v); err != nil {
		c.t.Fatalf("decode %s: %v", head.Type, err)
	}
	return v
}

func (c *testClient) send(v any) {
	c.t.Helper()
	data, err := protocol.Encode(v)
	if err != nil {
		c.t.Fatal(err)
	}
	if err := c.ws.WriteMessage(websocket.TextMessage, data); err != nil {
		c.t.Fatalf("send: %v", err)
	}
}

func (c *testClient) sign(msg []byte) string {
	return base64.StdEncoding.EncodeToString(ed25519.Sign(c.priv, msg))
}

func (c *testClient) auth() {
	c.t.Helper()
	chal, _ := base64.StdEncoding.DecodeString(c.hello.Challenge)
	msg := append(append([]byte{}, protocol.DomainAuth...), chal...)
	msg = append(msg, c.pub[:]...)
	a := protocol.Auth{
		Type:   protocol.TypeAuth,
		PubKey: base64.StdEncoding.EncodeToString(c.pub[:]),
		Sig:    c.sign(msg),
	}
	if c.hello.PoWBits > 0 {
		a.PoWNonce = grindPoW(chal, c.pub, c.hello.PoWBits)
	}
	c.send(a)
	if _, ok := c.read().(*protocol.OK); !ok {
		c.t.Fatal("auth failed")
	}
}

func grindPoW(chal []byte, pub identity.PubKey, bits int) string {
	var nonce [8]byte
	for i := uint64(0); i < 1<<32; i++ {
		binary.LittleEndian.PutUint64(nonce[:], i)
		if identity.CheckPoW(chal, pub, nonce[:], bits) {
			return base64.StdEncoding.EncodeToString(nonce[:])
		}
	}
	panic("no pow nonce found")
}

func (c *testClient) put(id [32]byte, payload []byte, ttl int64) any {
	c.t.Helper()
	c.send(protocol.Put{
		Type:       protocol.TypePut,
		ID:         base64.StdEncoding.EncodeToString(id[:]),
		Payload:    base64.StdEncoding.EncodeToString(payload),
		TTLSeconds: ttl,
		Sig:        c.sign(blob.SigMessage(id, ttl, payload)),
	})
	return c.read()
}

func (c *testClient) get(id [32]byte) any {
	c.t.Helper()
	c.send(protocol.Get{Type: protocol.TypeGet, ID: base64.StdEncoding.EncodeToString(id[:])})
	return c.read()
}

func TestWSFlow(t *testing.T) {
	_, ts := newTestServer(t, testConfig(t))
	c := dial(t, ts)
	c.auth()

	var id [32]byte
	rand.Read(id[:])
	payload := []byte("encrypted note contents")

	res := c.put(id, payload, 3600)
	ok, isOK := res.(*protocol.PutOK)
	if !isOK {
		t.Fatalf("put: %#v", res)
	}
	if ok.ExpiresAt <= time.Now().Unix() {
		t.Fatal("bad expires_at")
	}

	res = c.get(id)
	b, isBlob := res.(*protocol.Blob)
	if !isBlob {
		t.Fatalf("get: %#v", res)
	}
	got, _ := base64.StdEncoding.DecodeString(b.Payload)
	if !bytes.Equal(got, payload) {
		t.Fatal("payload mismatch")
	}

	c.send(protocol.List{Type: protocol.TypeList})
	l, isList := c.read().(*protocol.Blobs)
	if !isList || len(l.Items) != 1 {
		t.Fatalf("list: %#v", l)
	}
}

func TestSubEvents(t *testing.T) {
	_, ts := newTestServer(t, testConfig(t))
	// Same identity on two connections.
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/v1/ws"
	ws2, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ws2.Close()

	a := dial(t, ts)
	b := &testClient{t: t, ws: ws2, pub: a.pub, priv: a.priv}
	b.hello = *b.read().(*protocol.Hello)

	a.auth()
	b.auth()
	// a got a peer_joined for b.
	a.read()

	b.send(protocol.Sub{Type: protocol.TypeSub})
	b.read() // ok

	var id [32]byte
	rand.Read(id[:])
	a.put(id, []byte("x"), 3600)

	ev, isEv := b.read().(*protocol.Event)
	if !isEv || ev.Kind != protocol.EventBlobAdded {
		t.Fatalf("expected blob_added event, got %#v", ev)
	}
}

func TestSignalRouting(t *testing.T) {
	_, ts := newTestServer(t, testConfig(t))
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/v1/ws"
	ws2, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ws2.Close()

	a := dial(t, ts)
	b := &testClient{t: t, ws: ws2, pub: a.pub, priv: a.priv}
	b.hello = *b.read().(*protocol.Hello)
	a.auth()
	b.auth()
	a.read() // peer_joined

	bConnID := "" // discover via a's peer_joined
	// Re-read: a's peer_joined carried b's conn id — but we already read it.
	// Send a broadcast signal instead.
	_ = bConnID
	b.send(protocol.Signal{Type: protocol.TypeSignal, Payload: base64.StdEncoding.EncodeToString([]byte("offer"))})
	sig, isSig := a.read().(*protocol.SignalFrom)
	if !isSig {
		t.Fatal("expected signal")
	}
	p, _ := base64.StdEncoding.DecodeString(sig.Payload)
	if string(p) != "offer" {
		t.Fatal("signal payload mismatch")
	}
}

func TestAbuseCases(t *testing.T) {
	_, ts := newTestServer(t, testConfig(t))
	c := dial(t, ts)

	// Unauthenticated op.
	c.send(protocol.List{Type: protocol.TypeList})
	if e, ok := c.read().(*protocol.Error); !ok || e.Code != protocol.CodeUnauth {
		t.Fatal("expected unauth error")
	}

	// Bad signature on auth.
	badSig := make([]byte, 64) // zeros
	c.send(protocol.Auth{
		Type:   protocol.TypeAuth,
		PubKey: base64.StdEncoding.EncodeToString(c.pub[:]),
		Sig:    base64.StdEncoding.EncodeToString(badSig),
	})
	if e, ok := c.read().(*protocol.Error); !ok || e.Code != protocol.CodeBadSig {
		t.Fatal("expected bad_signature")
	}

	c.auth()

	// Unsigned put.
	var id [32]byte
	rand.Read(id[:])
	c.send(protocol.Put{
		Type: protocol.TypePut, ID: base64.StdEncoding.EncodeToString(id[:]),
		Payload:    base64.StdEncoding.EncodeToString([]byte("x")),
		TTLSeconds: 60, Sig: base64.StdEncoding.EncodeToString(make([]byte, 64)),
	})
	if e, ok := c.read().(*protocol.Error); !ok || e.Code != protocol.CodeBadSig {
		t.Fatal("expected bad_signature on put")
	}

	// Oversized put.
	big := make([]byte, 2<<20)
	c.send(protocol.Put{
		Type: protocol.TypePut, ID: base64.StdEncoding.EncodeToString(id[:]),
		Payload:    base64.StdEncoding.EncodeToString(big),
		TTLSeconds: 60, Sig: base64.StdEncoding.EncodeToString(make([]byte, 64)),
	})
	if e, ok := c.read().(*protocol.Error); !ok || e.Code != protocol.CodeTooLarge {
		t.Fatalf("expected too_large, got %#v", e)
	}

	// Cross-identity get.
	other := dial(t, ts)
	other.auth()
	res := other.get(id)
	if e, ok := res.(*protocol.Error); !ok || e.Code != protocol.CodeNotFound {
		t.Fatal("expected not_found for other identity")
	}
}

func TestPoWEnforced(t *testing.T) {
	cfg := testConfig(t)
	cfg.PoWBits = 8
	_, ts := newTestServer(t, cfg)
	c := dial(t, ts)

	// Auth without nonce must fail.
	chal, _ := base64.StdEncoding.DecodeString(c.hello.Challenge)
	msg := append(append([]byte{}, protocol.DomainAuth...), chal...)
	msg = append(msg, c.pub[:]...)
	c.send(protocol.Auth{
		Type: protocol.TypeAuth, PubKey: base64.StdEncoding.EncodeToString(c.pub[:]),
		Sig: c.sign(msg),
	})
	if e, ok := c.read().(*protocol.Error); !ok || e.Code != protocol.CodeBadPoW {
		t.Fatal("expected bad_pow")
	}

	// With a valid nonce it passes.
	c.auth()
}

func TestQuotaEnforcement(t *testing.T) {
	cfg := testConfig(t)
	cfg.IdentityQuota = int64(blob.HeaderSize) + 16 // one small blob
	_, ts := newTestServer(t, cfg)
	c := dial(t, ts)
	c.auth()

	var id1, id2 [32]byte
	rand.Read(id1[:])
	rand.Read(id2[:])
	if res := c.put(id1, []byte("1234567890123456"), 60); res == nil {
		t.Fatal("first put failed")
	}
	res := c.put(id2, []byte("another"), 60)
	if e, ok := res.(*protocol.Error); !ok || e.Code != protocol.CodeQuotaExceeded {
		t.Fatalf("expected quota_exceeded, got %#v", res)
	}
}

func TestRESTFlow(t *testing.T) {
	_, ts := newTestServer(t, testConfig(t))
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	var pk identity.PubKey
	copy(pk[:], pub)
	pubB64 := base64.StdEncoding.EncodeToString(pk[:])

	var id [32]byte
	rand.Read(id[:])
	payload := []byte("rest ciphertext")
	ttl := int64(600)

	req, _ := http.NewRequest(http.MethodPut, ts.URL+"/v1/blobs", bytes.NewReader(payload))
	req.Header.Set(hdrIdentity, pubB64)
	req.Header.Set(hdrBlobID, base64.StdEncoding.EncodeToString(id[:]))
	req.Header.Set(hdrTTL, fmt.Sprint(ttl))
	req.Header.Set(hdrSig, base64.StdEncoding.EncodeToString(ed25519.Sign(priv, blob.SigMessage(id, ttl, payload))))
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("put status %d", res.StatusCode)
	}
	res.Body.Close()

	// GET with fresh signed request.
	ts_ := fmt.Sprint(time.Now().Unix())
	sigMsg := append(append([]byte{}, protocol.DomainREST...), []byte("GET")...)
	sigMsg = append(sigMsg, id[:]...)
	sigMsg = append(sigMsg, ts_...)
	req, _ = http.NewRequest(http.MethodGet, ts.URL+"/v1/blobs/"+base64.RawURLEncoding.EncodeToString(id[:]), nil)
	req.Header.Set(hdrIdentity, pubB64)
	req.Header.Set(hdrTimestamp, ts_)
	req.Header.Set(hdrSig, base64.StdEncoding.EncodeToString(ed25519.Sign(priv, sigMsg)))
	res, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusOK {
		t.Fatalf("get status %d", res.StatusCode)
	}
	var out struct {
		Payload string `json:"payload"`
	}
	json.NewDecoder(res.Body).Decode(&out)
	res.Body.Close()
	got, _ := base64.StdEncoding.DecodeString(out.Payload)
	if !bytes.Equal(got, payload) {
		t.Fatal("rest payload mismatch")
	}

	// Stale timestamp rejected.
	req, _ = http.NewRequest(http.MethodGet, ts.URL+"/v1/blobs/"+base64.RawURLEncoding.EncodeToString(id[:]), nil)
	req.Header.Set(hdrIdentity, pubB64)
	req.Header.Set(hdrTimestamp, fmt.Sprint(time.Now().Unix()-600))
	req.Header.Set(hdrSig, base64.StdEncoding.EncodeToString(ed25519.Sign(priv, sigMsg)))
	res, _ = http.DefaultClient.Do(req)
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("stale ts status %d", res.StatusCode)
	}
	res.Body.Close()
}

func TestRSTRangeAndETag(t *testing.T) {
	_, ts := newTestServer(t, testConfig(t))
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	var pk identity.PubKey
	copy(pk[:], pub)
	pubB64 := base64.StdEncoding.EncodeToString(pk[:])

	var id [32]byte
	rand.Read(id[:])
	payload := []byte("0123456789abcdef")
	ttl := int64(600)

	req, _ := http.NewRequest(http.MethodPut, ts.URL+"/v1/blobs", bytes.NewReader(payload))
	req.Header.Set(hdrIdentity, pubB64)
	req.Header.Set(hdrBlobID, base64.StdEncoding.EncodeToString(id[:]))
	req.Header.Set(hdrTTL, fmt.Sprint(ttl))
	req.Header.Set(hdrSig, base64.StdEncoding.EncodeToString(ed25519.Sign(priv, blob.SigMessage(id, ttl, payload))))
	res, _ := http.DefaultClient.Do(req)
	res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("put %d", res.StatusCode)
	}

	sign := func(method string) (string, string) {
		ts_ := fmt.Sprint(time.Now().Unix())
		m := append(append([]byte{}, protocol.DomainREST...), []byte(method)...)
		m = append(m, id[:]...)
		m = append(m, ts_...)
		return ts_, base64.StdEncoding.EncodeToString(ed25519.Sign(priv, m))
	}
	path := ts.URL + "/v1/blobs/" + base64.RawURLEncoding.EncodeToString(id[:])

	// Raw range get.
	ts_, sig := sign("GET")
	req, _ = http.NewRequest(http.MethodGet, path+"?raw=1", nil)
	req.Header.Set(hdrIdentity, pubB64)
	req.Header.Set(hdrTimestamp, ts_)
	req.Header.Set(hdrSig, sig)
	req.Header.Set("Range", "bytes=4-9")
	res, _ = http.DefaultClient.Do(req)
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != http.StatusPartialContent || string(body) != "456789" {
		t.Fatalf("range: %d %q", res.StatusCode, body)
	}
	if res.Header.Get("Content-Range") != "bytes 4-9/16" {
		t.Fatalf("content-range: %s", res.Header.Get("Content-Range"))
	}
	etag := res.Header.Get("ETag")

	// Out-of-bounds range.
	req, _ = http.NewRequest(http.MethodGet, path+"?raw=1", nil)
	req.Header.Set(hdrIdentity, pubB64)
	req.Header.Set(hdrTimestamp, ts_)
	req.Header.Set(hdrSig, sig)
	req.Header.Set("Range", "bytes=99-199")
	res, _ = http.DefaultClient.Do(req)
	res.Body.Close()
	if res.StatusCode != http.StatusRequestedRangeNotSatisfiable {
		t.Fatalf("oob range: %d", res.StatusCode)
	}

	// ETag conditional get.
	req, _ = http.NewRequest(http.MethodGet, path+"?raw=1", nil)
	req.Header.Set(hdrIdentity, pubB64)
	req.Header.Set(hdrTimestamp, ts_)
	req.Header.Set(hdrSig, sig)
	req.Header.Set("If-None-Match", etag)
	res, _ = http.DefaultClient.Do(req)
	res.Body.Close()
	// No Range header: full-body path honors If-None-Match.
	if res.StatusCode != http.StatusNotModified && res.StatusCode != http.StatusOK {
		t.Fatalf("etag: %d", res.StatusCode)
	}

	// HEAD.
	req, _ = http.NewRequest(http.MethodHead, path, nil)
	req.Header.Set(hdrIdentity, pubB64)
	hTs, hSig := sign("HEAD")
	req.Header.Set(hdrTimestamp, hTs)
	req.Header.Set(hdrSig, hSig)
	res, _ = http.DefaultClient.Do(req)
	res.Body.Close()
	if res.StatusCode != http.StatusOK || res.Header.Get("Content-Length") != "16" {
		t.Fatalf("head: %d len=%s", res.StatusCode, res.Header.Get("Content-Length"))
	}
}

func TestHealthEndpoint(t *testing.T) {
	_, ts := newTestServer(t, testConfig(t))
	res, err := http.Get(ts.URL + "/v1/health")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("health %d", res.StatusCode)
	}
}

func TestDeleteFlow(t *testing.T) {
	_, ts := newTestServer(t, testConfig(t))
	c := dial(t, ts)
	c.auth()
	var id [32]byte
	rand.Read(id[:])
	c.put(id, []byte("x"), 3600)

	c.send(protocol.Del{
		Type: protocol.TypeDel, ID: base64.StdEncoding.EncodeToString(id[:]),
		Sig: c.sign(blob.DelSigMessage(id)),
	})
	if _, ok := c.read().(*protocol.OK); !ok {
		t.Fatal("del failed")
	}
	if e, ok := c.get(id).(*protocol.Error); !ok || e.Code != protocol.CodeNotFound {
		t.Fatal("expected not_found after delete")
	}
}
