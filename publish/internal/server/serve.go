package server

import (
	"io"
	"net"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/Sudo-Ivan/tactile/publish/internal/store"
)

// serveHost resolves the request Host to a site: {slug}.<base-domain>
// first, then the verified custom-domain map. Anything else gets the node
// landing response.
func (s *Server) serveHost(w http.ResponseWriter, r *http.Request) {
	host := hostOnly(r.Host)
	if s.cfg.BaseDomain != "" {
		if host == s.cfg.BaseDomain || host == "www."+s.cfg.BaseDomain {
			s.serveApex(w, r)
			return
		}
		if strings.HasSuffix(host, "."+s.cfg.BaseDomain) {
			slug := strings.TrimSuffix(host, "."+s.cfg.BaseDomain)
			if !strings.Contains(slug, ".") { // single label only
				s.serveSite(w, r, slug, r.URL.Path)
				return
			}
		}
	}
	if slug, ok := s.store.ResolveDomain(host); ok {
		s.serveSite(w, r, slug, r.URL.Path)
		return
	}
	if s.cfg.BaseDomain == "" {
		// Path mode: no serving suffix, so the bare host gets the same
		// landing response the apex gets in subdomain mode.
		s.serveApex(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusNotFound)
	_, _ = w.Write([]byte("no such site\n"))
}

// servePath serves /s/{slug}/... on any host, for operators who do not
// run a wildcard base domain.
func (s *Server) servePath(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	p := "/" + r.PathValue("path")
	if p == "/" {
		p = "/"
	}
	s.serveSite(w, r, slug, p)
}

func hostOnly(hostport string) string {
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}
	return strings.ToLower(strings.TrimSuffix(host, "."))
}

// serveApex answers requests to the bare base domain with a small JSON
// pointer document rather than a site.
func (s *Server) serveApex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("no such site\n"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"service": "tactile-publish",
		"node_id": s.nodeID,
		"info":    "/v1/info",
	})
}

// currentDeploy resolves a slug to its live deploy, through the TTL cache
// that bounds staleness across HA nodes.
func (s *Server) currentDeploy(slug string) (*store.SiteMeta, *store.Deploy, error) {
	s.mu.Lock()
	if c, ok := s.mcache[slug]; ok && time.Now().Before(c.expires) {
		s.mu.Unlock()
		return c.site, c.deploy, nil
	}
	s.mu.Unlock()

	meta, err := s.store.GetSite(slug)
	if err != nil || meta == nil {
		return nil, nil, err
	}
	if meta.Current == "" {
		return meta, nil, nil
	}
	dep, err := s.store.GetDeploy(slug, meta.Current)
	if err != nil {
		return meta, nil, err
	}
	s.mu.Lock()
	s.mcache[slug] = cachedDeploy{
		site: meta, deploy: dep,
		expires: time.Now().Add(s.cfg.ManifestTTL),
	}
	s.mu.Unlock()
	return meta, dep, nil
}

// serveSite streams one file out of the site's current deploy.
func (s *Server) serveSite(w http.ResponseWriter, r *http.Request, slug, reqPath string) {
	s.statsRequests.Add(1)
	if !s.readRL.Allow(s.clientIP(r)) {
		writeErr(w, http.StatusTooManyRequests, "rate_limited", "rate limited")
		return
	}
	meta, dep, err := s.currentDeploy(slug)
	if err != nil || meta == nil {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("no such site\n"))
		return
	}
	if dep == nil {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("site has no deploys yet\n"))
		return
	}

	clean := path.Clean("/" + strings.TrimPrefix(reqPath, "/"))
	entry := findFile(dep, clean)
	if entry == nil && clean == "/" {
		entry = findFile(dep, dep.Options.Entry)
	}
	if entry == nil && clean != "/" {
		entry = findFile(dep, clean+"/index.html")
	}
	if entry == nil && !strings.HasSuffix(clean, ".html") {
		entry = findFile(dep, clean+".html")
	}
	status := http.StatusOK
	if entry == nil {
		status = http.StatusNotFound
		entry = findFile(dep, dep.Options.NotFound)
	}
	if entry == nil {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("404 not found\n"))
		return
	}
	s.serveEntry(w, r, dep, entry, status)
}

func findFile(dep *store.Deploy, p string) *store.FileEntry {
	for i := range dep.Files {
		if dep.Files[i].Path == p {
			return &dep.Files[i]
		}
	}
	return nil
}

// serveEntry writes one manifest file, honoring ETag and Range via
// http.ServeContent. Response headers come from the deploy manifest plus
// site options, so a redeploy changes them atomically with the content.
func (s *Server) serveEntry(w http.ResponseWriter, r *http.Request, dep *store.Deploy, f *store.FileEntry, status int) {
	hash, err := f.HashBytes()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	rc, size, err := s.store.OpenObject(hash)
	if err != nil {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("404 not found\n"))
		return
	}
	defer func() { _ = rc.Close() }()

	etag := `"` + f.Hash[:32] + `"`
	if matchETag(r.Header.Get("If-None-Match"), etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	h := w.Header()
	h.Set("Content-Type", f.MIME)
	h.Set("ETag", etag)
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("X-Deploy-Id", dep.ID)
	if dep.Options.NoIndex {
		h.Set("X-Robots-Tag", "noindex")
	}
	for k, v := range dep.Options.Headers {
		h.Set(k, v)
	}
	if isHTMLish(f.MIME) {
		h.Set("Cache-Control", "public, max-age=60, must-revalidate")
	} else {
		h.Set("Cache-Control", "public, max-age=300")
	}
	if status == http.StatusNotFound {
		// ServeContent cannot emit a non-200/206 status; write manually.
		if r.Method == http.MethodHead {
			h.Set("Content-Length", strconv.FormatInt(size, 10))
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNotFound)
		n, _ := io.CopyN(w, rc, size)
		s.statsBytes.Add(n)
		return
	}
	http.ServeContent(w, r, path.Base(f.Path), time.Unix(dep.Created, 0), rc)
	s.statsBytes.Add(size)
}

func isHTMLish(mime string) bool {
	return strings.HasPrefix(mime, "text/html") || strings.HasPrefix(mime, "application/xhtml")
}

// matchETag reports whether an If-None-Match header contains etag.
func matchETag(inm, etag string) bool {
	for _, t := range strings.Split(inm, ",") {
		if t := strings.TrimSpace(t); t == etag || t == "*" {
			return true
		}
	}
	return false
}
