package server

import (
	"net/http"
	"testing"

	"github.com/Sudo-Ivan/tactile/relay/internal/config"
	"github.com/Sudo-Ivan/tactile/relay/internal/store"
)

func req(remoteAddr, xff string) *http.Request {
	r, _ := http.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = remoteAddr
	if xff != "" {
		r.Header.Set("X-Forwarded-For", xff)
	}
	return r
}

func TestClientIPNoProxies(t *testing.T) {
	cfg := config.Default()
	cfg.DataDir = t.TempDir()
	cfg.TrustedProxies = ""
	st, err := store.OpenFS(t.TempDir(), cfg.MaxBlobSize)
	if err != nil {
		t.Fatal(err)
	}
	s, err := New(cfg, st)
	if err != nil {
		t.Fatal(err)
	}
	// XFF ignored when no proxies are trusted.
	if got := s.clientIP(req("1.2.3.4:9999", "9.9.9.9")); got != "1.2.3.4" {
		t.Fatalf("got %s", got)
	}
}

func TestClientIPTrustedProxy(t *testing.T) {
	cfg := config.Default()
	cfg.DataDir = t.TempDir()
	cfg.TrustedProxies = "10.0.0.0/8, 192.168.1.1"
	st, err := store.OpenFS(t.TempDir(), cfg.MaxBlobSize)
	if err != nil {
		t.Fatal(err)
	}
	s, err := New(cfg, st)
	if err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name       string
		remoteAddr string
		xff        string
		want       string
	}{
		{"direct untrusted", "8.8.8.8:1", "1.1.1.1", "8.8.8.8"},
		{"trusted single hop", "10.1.2.3:80", "203.0.113.5", "203.0.113.5"},
		{"trusted chain", "10.0.0.1:80", "203.0.113.5, 10.9.9.9", "203.0.113.5"},
		{"untrusted mid chain", "10.0.0.1:80", "203.0.113.5, 66.66.66.66, 10.9.9.9", "66.66.66.66"},
		{"spoofed leftmost", "10.0.0.1:80", "1.2.3.4, 10.5.5.5", "1.2.3.4"},
		{"no xff", "10.0.0.1:80", "", "10.0.0.1"},
		{"second trusted", "192.168.1.1:443", "198.51.100.7", "198.51.100.7"},
		{"garbage xff", "10.0.0.1:80", "not-an-ip, also-bad", "10.0.0.1"},
	}
	for _, c := range cases {
		if got := s.clientIP(req(c.remoteAddr, c.xff)); got != c.want {
			t.Errorf("%s: got %s, want %s", c.name, got, c.want)
		}
	}
}

func TestBadProxyConfig(t *testing.T) {
	cfg := config.Default()
	cfg.DataDir = t.TempDir()
	cfg.TrustedProxies = "not-a-cidr"
	st, err := store.OpenFS(t.TempDir(), cfg.MaxBlobSize)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := New(cfg, st); err == nil {
		t.Fatal("bad proxy config accepted")
	}
}
