// Package server wires config, store, auth and rate limiting into the
// publish node's HTTP surface. One listener serves public site content by
// Host header (or /s/{slug}/ paths); the REST API lives on the same port
// unless -admin-addr splits it onto a private listener.
package server

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Sudo-Ivan/tactile/publish/internal/config"
	"github.com/Sudo-Ivan/tactile/publish/internal/identity"
	"github.com/Sudo-Ivan/tactile/publish/internal/protocol"
	"github.com/Sudo-Ivan/tactile/publish/internal/ratelimit"
	"github.com/Sudo-Ivan/tactile/publish/internal/store"
	"github.com/Sudo-Ivan/tactile/publish/internal/tier"
)

// Server is a publish node.
type Server struct {
	cfg      config.Config
	store    store.Backend
	nodeID   string
	nodeKey  [32]byte // backend-shared secret: PoW challenges, DNS verify tokens
	reserved map[string]bool

	tiers      map[string]tier.Tier
	secrets    [][]byte // empty means paid tiers disabled entirely
	uaPrefixes []string // empty means User-Agent is not checked on the API
	resolver   *net.Resolver

	connRL *ratelimit.Limiter // per-IP API rate
	readRL *ratelimit.Limiter // per-IP public read rate
	depRL  *ratelimit.Limiter // per-identity deploy rate

	trusted []netip.Prefix // proxies allowed to set X-Forwarded-For

	mu        sync.Mutex
	conns     map[string]int
	siteLocks map[string]*sync.Mutex
	mcache    map[string]cachedDeploy // slug -> current deploy
	marked    map[[32]byte]bool       // two-pass orphan sweep marks
	stopCh    chan struct{}
	http      *http.Server
	admin     *http.Server // non-nil when -admin-addr splits the API

	statsRequests  atomic.Int64
	statsBytes     atomic.Int64
	statsDeploys   atomic.Int64
	statsAPIErrors atomic.Int64
}

type cachedDeploy struct {
	site    *store.SiteMeta
	deploy  *store.Deploy
	expires time.Time
}

// New builds a server. st must already be open.
func New(cfg config.Config, st store.Backend) (*Server, error) {
	key, err := loadOrCreateKey(st)
	if err != nil {
		return nil, err
	}
	id := sha256.Sum256(key[:])

	trusted, err := cfg.ParseTrustedProxies()
	if err != nil {
		return nil, err
	}
	secrets, tiers, err := parsePaidConfig(cfg)
	if err != nil {
		return nil, err
	}

	s := &Server{
		cfg:        cfg,
		store:      st,
		nodeID:     hex.EncodeToString(id[:8]),
		nodeKey:    key,
		reserved:   cfg.Reserved(),
		tiers:      tiers,
		uaPrefixes: parsePrefixes(cfg.UAWhitelist),
		secrets:    secrets,
		resolver:   makeResolver(cfg.DNSResolver),
		connRL:     ratelimit.New(cfg.ConnRatePerSec, cfg.ConnRatePerSec*2),
		readRL:     ratelimit.New(cfg.ReadRatePerSec, cfg.ReadRatePerSec*2),
		depRL:      ratelimit.New(cfg.DeployRatePerSec, cfg.DeployRatePerSec*2+3),
		trusted:    trusted,
		conns:      make(map[string]int),
		siteLocks:  make(map[string]*sync.Mutex),
		mcache:     make(map[string]cachedDeploy),
		marked:     make(map[[32]byte]bool),
		stopCh:     make(chan struct{}),
	}

	public := http.NewServeMux()
	if cfg.AdminAddr == "" {
		s.mountAPI(public) // merged mode: API shares the public listener
	} else {
		public.HandleFunc("GET /v1/health", s.handleHealth) // LB probes
		adminMux := http.NewServeMux()
		s.mountAPI(adminMux)
		s.admin = &http.Server{
			Addr: cfg.AdminAddr, Handler: adminMux,
			ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 60 * time.Second,
			WriteTimeout: 120 * time.Second, IdleTimeout: 60 * time.Second,
			MaxHeaderBytes: 16 << 10,
		}
	}
	public.HandleFunc("GET /s/{slug}", s.servePath)
	public.HandleFunc("GET /s/{slug}/{path...}", s.servePath)
	public.HandleFunc("GET /", s.serveHost) // also matches HEAD
	s.http = &http.Server{
		Addr:              cfg.Addr,
		Handler:           public,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
	return s, nil
}

// mountAPI registers the REST endpoints. On the public listener only
// info/health are meant to be reachable; the write handlers still apply
// signature checks, and operators can wall off /v1 at their edge.
func (s *Server) mountAPI(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/info", s.handleInfo)
	mux.HandleFunc("GET /v1/health", s.handleHealth)
	mux.HandleFunc("GET /v1/challenge", s.handleChallenge)
	mux.HandleFunc("GET /v1/usage", s.handleUsage)
	mux.HandleFunc("GET /v1/sites", s.handleListSites)
	mux.HandleFunc("PUT /v1/sites/{slug}", s.handlePutSite)
	mux.HandleFunc("GET /v1/sites/{slug}", s.handleGetSite)
	mux.HandleFunc("DELETE /v1/sites/{slug}", s.handleDeleteSite)
	mux.HandleFunc("POST /v1/sites/{slug}/deploys", s.handleDeploy)
	mux.HandleFunc("GET /v1/sites/{slug}/deploys", s.handleListDeploys)
	mux.HandleFunc("POST /v1/sites/{slug}/rollback", s.handleRollback)
	mux.HandleFunc("POST /v1/sites/{slug}/domains", s.handleAddDomain)
	mux.HandleFunc("POST /v1/sites/{slug}/domains/verify", s.handleVerifyDomain)
	mux.HandleFunc("DELETE /v1/sites/{slug}/domains/{domain}", s.handleDeleteDomain)
}

// Handler exposes the public HTTP handler, mainly for tests.
func (s *Server) Handler() http.Handler { return s.http.Handler }

// NodeID returns the stable node identifier.
func (s *Server) NodeID() string { return s.nodeID }

// ListenAndServe runs until stopped. With a split admin listener both
// serve concurrently; the first fatal error wins.
func (s *Server) ListenAndServe() error {
	go s.sweeper()
	errCh := make(chan error, 2)
	go func() { errCh <- s.http.ListenAndServe() }()
	if s.admin != nil {
		go func() { errCh <- s.admin.ListenAndServe() }()
	}
	return <-errCh
}

// Close drains gracefully: stop the sweeper, then shut down HTTP.
func (s *Server) Close() error {
	close(s.stopCh)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	err := s.http.Shutdown(ctx)
	if s.admin != nil {
		_ = s.admin.Shutdown(ctx)
	}
	_ = s.store.Close()
	return err
}

// sweeper refreshes eventually-consistent indexes and reaps orphan
// objects. Orphans need two consecutive passes unreferenced before
// deletion, so an in-flight deploy on this or a peer node is never swept
// mid-write.
func (s *Server) sweeper() {
	t := time.NewTicker(s.cfg.SweepInterval)
	defer t.Stop()
	for {
		select {
		case <-s.stopCh:
			return
		case <-t.C:
			if err := s.store.Refresh(); err != nil {
				continue
			}
			s.sweepOrphans()
		}
	}
}

func (s *Server) sweepOrphans() {
	refs := make(map[[32]byte]bool)
	sites, err := s.store.ListSites()
	if err != nil {
		return
	}
	for _, m := range sites {
		for _, id := range m.Deploys {
			d, err := s.store.GetDeploy(m.Slug, id)
			if err != nil {
				continue
			}
			for _, f := range d.Files {
				if h, err := f.HashBytes(); err == nil {
					refs[h] = true
				}
			}
		}
	}
	objs, err := s.store.ListObjects()
	if err != nil {
		return
	}
	s.mu.Lock()
	freshMarks := make(map[[32]byte]bool)
	for h := range objs {
		if refs[h] {
			continue
		}
		if s.marked[h] {
			freshMarks[h] = true
		} else {
			freshMarks[h] = true // first sighting: mark only
		}
	}
	// Delete objects marked on the previous pass.
	for h := range s.marked {
		if !refs[h] {
			_ = s.store.DeleteObject(h)
			delete(freshMarks, h)
		}
	}
	s.marked = freshMarks
	s.mu.Unlock()
}

func (s *Server) now() int64 { return time.Now().Unix() }

// siteLock serializes deploy/meta writes per site so concurrent deploys
// cannot lose each other's manifest list updates.
func (s *Server) siteLock(slug string) *sync.Mutex {
	s.mu.Lock()
	defer s.mu.Unlock()
	l := s.siteLocks[slug]
	if l == nil {
		l = &sync.Mutex{}
		s.siteLocks[slug] = l
	}
	return l
}

// parsePaidConfig resolves token secrets and the tier table. With no
// secrets, paid tiers are fully off and every request gets limits from
// the plain config values.
func parsePaidConfig(cfg config.Config) ([][]byte, map[string]tier.Tier, error) {
	var secrets [][]byte
	for _, part := range strings.Split(cfg.TokenSecrets, ",") {
		part = strings.TrimSpace(part)
		if part != "" {
			secrets = append(secrets, []byte(part))
		}
	}
	if len(secrets) == 0 {
		return nil, map[string]tier.Tier{"free": {
			QuotaBytes:     cfg.SiteQuota,
			MaxSites:       cfg.MaxSites,
			MaxDomains:     cfg.MaxDomains,
			MaxSiteBytes:   cfg.MaxSiteBytes,
			MaxFileBytes:   cfg.MaxFileBytes,
			MaxFiles:       cfg.MaxFiles,
			MaxBundleBytes: cfg.MaxBundleSize,
		}}, nil
	}
	tiers, err := tier.LoadTiers(cfg.TiersFile)
	if err != nil {
		return nil, nil, err
	}
	return secrets, tiers, nil
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

// checkUA enforces the User-Agent whitelist on the API. It exists to keep
// scrapers off the write surface, not to authenticate anyone. Info and
// health stay open so monitoring and client probing keep working.
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

// limitsFor resolves the effective limits for a request. No token means
// the free tier; a bad or expired token is rejected rather than silently
// downgraded so a paying user notices instead of quietly degrading.
func (s *Server) limitsFor(token string) (tier.Tier, error) {
	if len(s.secrets) == 0 {
		return s.tiers["free"], nil
	}
	if token == "" {
		return s.tiers["free"], nil
	}
	name, err := tier.Verify(s.secrets, token, s.now())
	if err != nil {
		return tier.Tier{}, err
	}
	t, ok := s.tiers[name]
	if !ok {
		return tier.Tier{}, tier.ErrBadTier
	}
	return t, nil
}

// clientIP returns the client IP, honoring X-Forwarded-For only when the
// direct peer is a configured trusted proxy.
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

// admitConn enforces per-IP API rate and count plus the global cap.
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

// identityUsage returns deduplicated bytes across all of an identity's
// retained deploys. Objects are content-addressed, so a file redeployed
// or shared between sites counts once.
func (s *Server) identityUsage(owner identity.PubKey) (store.Usage, error) {
	sites, err := s.store.ListSites()
	if err != nil {
		return store.Usage{}, err
	}
	var u store.Usage
	seen := make(map[[32]byte]bool)
	for _, m := range sites {
		if m.Owner != owner {
			continue
		}
		u.Sites++
		for _, id := range m.Deploys {
			d, err := s.store.GetDeploy(m.Slug, id)
			if err != nil {
				continue
			}
			for _, f := range d.Files {
				h, err := f.HashBytes()
				if err != nil || seen[h] {
					continue
				}
				seen[h] = true
				u.Bytes += f.Size
				u.Files++
			}
		}
	}
	return u, nil
}

func (s *Server) handleInfo(w http.ResponseWriter, r *http.Request) {
	free := s.tiers["free"]
	used := s.store.TotalBytes()
	writeJSON(w, http.StatusOK, map[string]any{
		"version":        protocol.Version,
		"node_id":        s.nodeID,
		"base_domain":    s.cfg.BaseDomain,
		"read_only":      s.cfg.ReadOnly,
		"pow_bits":       s.cfg.PoWBits,
		"pow_window_sec": int64(s.cfg.PoWWindow.Seconds()),
		"limits": map[string]any{
			"quota_bytes":      free.QuotaBytes,
			"max_sites":        free.MaxSites,
			"max_domains":      free.MaxDomains,
			"max_site_bytes":   free.MaxSiteBytes,
			"max_file_bytes":   free.MaxFileBytes,
			"max_files":        free.MaxFiles,
			"max_bundle_bytes": free.MaxBundleBytes,
		},
		"now":        s.now(),
		"paid_tiers": len(s.secrets) > 0,
		"load": map[string]any{
			"conns":            s.ConnCount(),
			"max_conns":        s.cfg.MaxConns,
			"storage_bytes":    used,
			"storage_cap":      s.cfg.MaxStorage,
			"storage_used_pct": pct(used, s.cfg.MaxStorage),
		},
		"stats": map[string]any{
			"requests_total": s.statsRequests.Load(),
			"bytes_served":   s.statsBytes.Load(),
			"deploys_total":  s.statsDeploys.Load(),
		},
	})
}

func pct(used, cap int64) int {
	if cap <= 0 {
		return 0
	}
	return int(used * 100 / cap)
}

// ConnCount reports open API connections tracked by admitConn.
func (s *Server) ConnCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	var n int
	for _, c := range s.conns {
		n += c
	}
	return n
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

// loadOrCreateKey reads the shared node key from the backend, generating
// and persisting it on first run. Because it lives in the backend, every
// node in an HA set derives identical PoW challenges and DNS tokens.
func loadOrCreateKey(st store.Backend) ([32]byte, error) {
	var key [32]byte
	b, err := st.LoadSecret("node.key")
	if err != nil {
		return key, err
	}
	if len(b) == 32 {
		copy(key[:], b)
		return key, nil
	}
	if _, err := rand.Read(key[:]); err != nil {
		return key, err
	}
	if err := st.SaveSecret("node.key", key[:]); err != nil {
		return key, err
	}
	return key, nil
}

// powChallenge derives the stateless PoW challenge for a window index:
// HMAC(nodeKey, DomainPoW || window). Any node in the HA set recomputes
// the same challenge without a shared challenge store.
func (s *Server) powChallenge(window int64) []byte {
	h := hmac.New(sha256.New, s.nodeKey[:])
	h.Write(protocol.DomainPoW)
	_, _ = fmt.Fprintf(h, "%d", window)
	return h.Sum(nil)
}

// checkPoW accepts a nonce satisfying CheckPoW for the current or previous
// challenge window, which covers the rollover between issue and use.
func (s *Server) checkPoW(pub identity.PubKey, nonce []byte) bool {
	if s.cfg.PoWBits <= 0 {
		return true
	}
	w := time.Now().Unix() / int64(s.cfg.PoWWindow.Seconds())
	for _, widx := range []int64{w, w - 1} {
		if identity.CheckPoW(s.powChallenge(widx), pub, nonce, s.cfg.PoWBits) {
			return true
		}
	}
	return false
}

func (s *Server) handleChallenge(w http.ResponseWriter, r *http.Request) {
	widx := time.Now().Unix() / int64(s.cfg.PoWWindow.Seconds())
	writeJSON(w, http.StatusOK, map[string]any{
		"challenge":   b64(s.powChallenge(widx)),
		"pow_bits":    s.cfg.PoWBits,
		"window_secs": int64(s.cfg.PoWWindow.Seconds()),
	})
}

// requireWritable rejects write endpoints on read-only replicas.
func (s *Server) requireWritable(w http.ResponseWriter) bool {
	if s.cfg.ReadOnly {
		writeErr(w, http.StatusForbidden, protocol.CodeReadOnly, "node is read-only")
		return false
	}
	return true
}

// badAPI is the common gate for authed endpoints: UA, per-IP rate and
// connection cap.
func (s *Server) badAPI(w http.ResponseWriter, r *http.Request) bool {
	if !s.checkUA(w, r) {
		s.statsAPIErrors.Add(1)
		return true
	}
	if !s.admitConn(s.clientIP(r)) {
		writeErr(w, http.StatusTooManyRequests, protocol.CodeRateLimited, "rate limited")
		s.statsAPIErrors.Add(1)
		return true
	}
	return false
}
