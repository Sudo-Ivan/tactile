package client

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Sudo-Ivan/tactile/relay/internal/config"
	"github.com/Sudo-Ivan/tactile/relay/internal/server"
	"github.com/Sudo-Ivan/tactile/relay/internal/store"
)

func startRelay(t *testing.T) (*httptest.Server, *server.Server) {
	t.Helper()
	cfg := config.Default()
	cfg.DataDir = t.TempDir()
	cfg.PoWBits = 0
	cfg.MinTTL = time.Second
	st, err := store.OpenFS(cfg.DataDir, cfg.MaxBlobSize)
	if err != nil {
		t.Fatal(err)
	}
	srv, err := server.New(cfg, st)
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(func() { ts.Close(); srv.Close() })
	return ts, srv
}

func TestClientMultiRelay(t *testing.T) {
	ts1, _ := startRelay(t)
	ts2, _ := startRelay(t)

	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	c := New([]string{ts1.URL, ts2.URL}, priv)

	var id [32]byte
	rand.Read(id[:])
	payload := []byte("hello multi-relay")

	// Put fans out to both.
	if err := c.Put(context.Background(), id, payload, 600, 2); err != nil {
		t.Fatal(err)
	}

	got, err := c.Get(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, payload) {
		t.Fatal("payload mismatch")
	}

	items, err := c.List(context.Background())
	if err != nil || len(items) != 1 {
		t.Fatalf("list: %v %v", items, err)
	}
}

func TestClientFailover(t *testing.T) {
	ts1, _ := startRelay(t)
	ts2, _ := startRelay(t)

	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	c := New([]string{ts1.URL, ts2.URL}, priv)

	var id [32]byte
	rand.Read(id[:])
	payload := []byte("failover payload")
	if err := c.Put(context.Background(), id, payload, 600, 1); err != nil {
		t.Fatal(err)
	}

	// Kill relay 1; reads still work from relay 2.
	ts1.Close()
	got, err := c.Get(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, payload) {
		t.Fatal("payload mismatch after failover")
	}
}

func TestClientGetRange(t *testing.T) {
	ts, _ := startRelay(t)
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	c := New([]string{ts.URL}, priv)

	var id [32]byte
	rand.Read(id[:])
	payload := []byte("0123456789abcdef")
	if err := c.Put(context.Background(), id, payload, 600, 1); err != nil {
		t.Fatal(err)
	}
	part, total, err := c.GetRange(context.Background(), id, 4, 10)
	if err != nil {
		t.Fatal(err)
	}
	if total != int64(len(payload)) || string(part) != "456789" {
		t.Fatalf("range %q total %d", part, total)
	}
}

func TestClientProbe(t *testing.T) {
	ts, _ := startRelay(t)
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	c := New([]string{ts.URL, "http://127.0.0.1:1"}, priv)
	infos := c.Probe(context.Background())
	if infos[ts.URL] == nil {
		t.Fatal("live relay not probed")
	}
	if infos["http://127.0.0.1:1"] != nil {
		t.Fatal("dead relay reported info")
	}
}
