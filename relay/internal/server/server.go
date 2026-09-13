// Package server wires config, store, hub and rate limiting into the relay's
// HTTP/WebSocket surface. The relay is blind: every stored byte is signed
// ciphertext owned by an Ed25519 identity.
package server

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/netip"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/Sudo-Ivan/tactile/relay/internal/config"
	"github.com/Sudo-Ivan/tactile/relay/internal/hub"
	"github.com/Sudo-Ivan/tactile/relay/internal/identity"
	"github.com/Sudo-Ivan/tactile/relay/internal/protocol"
	"github.com/Sudo-Ivan/tactile/relay/internal/ratelimit"
	"github.com/Sudo-Ivan/tactile/relay/internal/store"
)

// Server is the relay.
type Server struct {
	cfg     config.Config
	store   store.Backend
	hub     *hub.Hub
	msgRL   *ratelimit.Limiter // per-connection message rate
	connRL  *ratelimit.Limiter // per-IP connection rate
	relayID string

	allowed    map[[32]byte]bool // nil/empty means no explicit allowlist entries
	uaPrefixes []string          // empty means User-Agent is not checked

	mu      sync.Mutex
	conns   map[string]int // remote IP -> open conns
	wss     map[*conn]struct{}
	trusted []netip.Prefix // proxies allowed to set X-Forwarded-For
	stopCh  chan struct{}
	http    *http.Server
}

// New builds a server. store must already be open.
func New(cfg config.Config, st store.Backend) (*Server, error) {
	// Relay ID: a stable random value persisted alongside the data. It
	// identifies the relay in /v1/info without identifying anyone.
	root, err := os.OpenRoot(cfg.DataDir)
	if err != nil {
		return nil, err
	}
	defer func() { _ = root.Close() }()
	key, err := loadOrCreateKey(root)
	if err != nil {
		return nil, err
	}
	id := sha256.Sum256(key[:])

	trusted, err := cfg.ParseTrustedProxies()
	if err != nil {
		return nil, err
	}
	allowed, err := cfg.AllowedSet()
	if err != nil {
		return nil, err
	}

	s := &Server{
		cfg:        cfg,
		store:      st,
		hub:        hub.New(),
		msgRL:      ratelimit.New(cfg.MsgRatePerSec, cfg.MsgRatePerSec*2),
		connRL:     ratelimit.New(cfg.ConnRatePerSec, cfg.ConnRatePerSec*2),
		relayID:    hex.EncodeToString(id[:8]),
		allowed:    allowed,
		uaPrefixes: parsePrefixes(cfg.UAWhitelist),
		conns:      make(map[string]int),
		wss:        make(map[*conn]struct{}),
		trusted:    trusted,
		stopCh:     make(chan struct{}),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET "+protocol.PathInfo, s.handleInfo)
	mux.HandleFunc("GET "+protocol.PathHealth, s.handleHealth)
	mux.HandleFunc("GET "+protocol.PathWS, s.handleWS)
	mux.HandleFunc("HEAD "+protocol.PathBlob, s.handleHead)
	mux.HandleFunc("PUT "+protocol.PathBlobs, s.handlePut)
	mux.HandleFunc("GET "+protocol.PathBlobs, s.handleList)
	mux.HandleFunc("GET "+protocol.PathBlob, s.handleGet)
	mux.HandleFunc("DELETE "+protocol.PathBlob, s.handleDelete)

	s.http = &http.Server{
		Addr:              cfg.Addr,
		Handler:           cors(mux),
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
		ReadTimeout:       cfg.ReadTimeout,
		// WriteTimeout must stay zero: WebSocket conns are long-lived.
		IdleTimeout:    cfg.IdleTimeout,
		MaxHeaderBytes: cfg.MaxHeaderBytes,
	}
	return s, nil
}

// Handler exposes the HTTP handler, mainly for tests.
func (s *Server) Handler() http.Handler { return s.http.Handler }

// cors lets browser clients (the web app, the Tauri webview) call the REST
// API. Access is authorized by per-request signatures, not cookies, so any
// origin is safe to admit; the wildcard never pairs with credentials.
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Access-Control-Allow-Methods", "GET, PUT, DELETE, HEAD, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Content-Type, "+
			"X-Tactile-Identity, X-Tactile-Blob-Id, X-Tactile-Ttl, "+
			"X-Tactile-Timestamp, X-Tactile-Signature")
		h.Set("Access-Control-Max-Age", "86400")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RelayID returns the stable relay identifier.
func (s *Server) RelayID() string { return s.relayID }

// ListenAndServe runs until the server is stopped.
func (s *Server) ListenAndServe() error {
	go s.store.Sweeper(s.cfg.SweepInterval, s.stopCh)
	return s.http.ListenAndServe()
}

// Close drains gracefully: stop the sweeper, close live WebSocket conns
// (hijacked conns are not covered by http.Shutdown), then shut down HTTP.
func (s *Server) Close() error {
	close(s.stopCh)
	s.mu.Lock()
	conns := make([]*conn, 0, len(s.wss))
	for c := range s.wss {
		conns = append(conns, c)
	}
	s.mu.Unlock()
	for _, c := range conns {
		c.close()
	}
	ctx, cancel := context.WithTimeout(context.Background(), s.cfg.ShutdownTimeout)
	defer cancel()
	err := s.http.Shutdown(ctx)
	_ = s.store.Close()
	return err
}

// ConnCount reports live connections, for health checks and /v1/info load.
func (s *Server) ConnCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	var n int
	for _, c := range s.conns {
		n += c
	}
	return n
}

func (s *Server) now() int64 { return time.Now().Unix() }

// allowIdentity gates authenticated access. Public mode lets every
// identity in; otherwise the public key must be on the allowlist.
func (s *Server) allowIdentity(pub identity.PubKey) bool {
	return s.cfg.AllowPublic || s.allowed[pub]
}

func parsePrefixes(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// checkUA enforces the User-Agent whitelist. It exists to keep scrapers
// and uncooperative bots off the API, not to authenticate anyone; a
// determined client can always spoof it. Info and health stay open so
// monitoring and client probing keep working.
func (s *Server) checkUA(w http.ResponseWriter, r *http.Request) bool {
	if len(s.uaPrefixes) == 0 {
		return true
	}
	ua := r.Header.Get("User-Agent")
	for _, p := range s.uaPrefixes {
		if strings.HasPrefix(ua, p) {
			return true
		}
	}
	writeErr(w, http.StatusForbidden, protocol.CodeForbiddenUA, "user-agent not allowed")
	return false
}

// clientIP returns the client IP, honoring X-Forwarded-For only when the
// direct peer is a configured trusted proxy. The first untrusted address
// from the right wins, so a client cannot spoof its IP through a trusted
// hop.
func (s *Server) clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	peer, err := netip.ParseAddr(host)
	if err != nil || !s.isTrusted(peer) {
		return host
	}
	xff := r.Header.Get("X-Forwarded-For")
	if xff == "" {
		return host
	}
	parts := strings.Split(xff, ",")
	for i := len(parts) - 1; i >= 0; i-- {
		a, err := netip.ParseAddr(strings.TrimSpace(parts[i]))
		if err != nil {
			continue
		}
		if !s.isTrusted(a) {
			return a.String()
		}
	}
	// Every hop is trusted: the leftmost entry is the original client.
	if a, err := netip.ParseAddr(strings.TrimSpace(parts[0])); err == nil {
		return a.String()
	}
	return host
}

func (s *Server) isTrusted(a netip.Addr) bool {
	for _, p := range s.trusted {
		if p.Contains(a) {
			return true
		}
	}
	return false
}

// admitConn enforces per-IP connection rate and count, plus the global
// connection cap. Call releaseConn when the connection ends.
func (s *Server) admitConn(ip string) bool {
	if !s.connRL.Allow(ip) {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.conns[ip] >= s.cfg.MaxConnsPerIP {
		return false
	}
	if s.cfg.MaxConns > 0 {
		var total int
		for _, n := range s.conns {
			total += n
		}
		if total >= s.cfg.MaxConns {
			return false
		}
	}
	s.conns[ip]++
	return true
}

func (s *Server) releaseConn(ip string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.conns[ip] <= 1 {
		delete(s.conns, ip)
	} else {
		s.conns[ip]--
	}
}

func (s *Server) handleInfo(w http.ResponseWriter, r *http.Request) {
	used := s.store.TotalBytes()
	writeJSON(w, http.StatusOK, map[string]any{
		"version":              protocol.Version,
		"relay_id":             s.relayID,
		"pow_bits":             s.cfg.PoWBits,
		"max_blob_size":        s.cfg.MaxBlobSize,
		"min_ttl_seconds":      int64(s.cfg.MinTTL.Seconds()),
		"max_ttl_seconds":      int64(s.cfg.MaxTTL.Seconds()),
		"identity_quota_bytes": s.cfg.IdentityQuota,
		"now":                  s.now(),
		"allow_public":         s.cfg.AllowPublic,
		"load": map[string]any{
			"conns":            s.ConnCount(),
			"max_conns":        s.cfg.MaxConns,
			"storage_bytes":    used,
			"storage_cap":      s.cfg.MaxStorage,
			"storage_used_pct": pct(used, s.cfg.MaxStorage),
		},
	})
}

func pct(used, cap int64) int {
	if cap <= 0 {
		return 0
	}
	return int(used * 100 / cap)
}

// handleHealth is a liveness/readiness probe for load balancers. It
// reports 503 when storage is full so a proxy can stop routing writes.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	used := s.store.TotalBytes()
	status := http.StatusOK
	state := "ok"
	if used >= s.cfg.MaxStorage {
		status = http.StatusServiceUnavailable
		state = "storage_full"
	}
	writeJSON(w, status, map[string]any{
		"status":        state,
		"conns":         s.ConnCount(),
		"storage_bytes": used,
		"now":           s.now(),
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{
		"type":    "error",
		"code":    code,
		"message": msg,
	})
}

func b64(b []byte) string { return base64.StdEncoding.EncodeToString(b) }

// loadOrCreateKey reads the relay key from the store root, generating and
// persisting it on first run.
func loadOrCreateKey(root *os.Root) ([32]byte, error) {
	var key [32]byte
	b, err := root.ReadFile("relay.key")
	if err == nil {
		decoded, derr := hex.DecodeString(string(bytes.TrimSpace(b)))
		if derr != nil || len(decoded) != 32 {
			return key, errors.New("bad relay key file")
		}
		copy(key[:], decoded)
		return key, nil
	}
	if _, err := rand.Read(key[:]); err != nil {
		return key, err
	}
	if err := root.WriteFile("relay.key", []byte(hex.EncodeToString(key[:])+"\n"), 0o600); err != nil {
		return key, err
	}
	return key, nil
}
