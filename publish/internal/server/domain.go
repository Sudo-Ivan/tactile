package server

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/Sudo-Ivan/tactile/publish/internal/protocol"
	"github.com/Sudo-Ivan/tactile/publish/internal/store"
)

// verifyPrefix is the TXT record label owners publish under their domain.
const verifyPrefix = "_tactile-verify."

// verifyToken is the expected TXT value for a site+domain pair:
// deterministic HMAC under the shared node key, so every node in an HA
// set accepts the same proof and there is nothing to store.
func (s *Server) verifyToken(slug, domain string) string {
	h := hmac.New(sha256.New, s.nodeKey[:])
	h.Write(protocol.DomainVerify)
	h.Write([]byte(slug))
	h.Write([]byte{0})
	h.Write([]byte(domain))
	return "tactile-publish=" + base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}

func makeResolver(addr string) *net.Resolver {
	if addr == "" {
		return net.DefaultResolver
	}
	return &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, _ string) (net.Conn, error) {
			d := net.Dialer{Timeout: 5 * time.Second}
			return d.DialContext(ctx, network, addr)
		},
	}
}

// lookupTXT is injectable for tests.
var lookupTXT = func(r *net.Resolver, name string) ([]string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return r.LookupTXT(ctx, name)
}

// normalizeDomain lowercases, strips a trailing dot and validates shape.
// Internationalized names arrive already punycoded by the client.
func normalizeDomain(d string) (string, bool) {
	d = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(d), "."))
	if len(d) < 4 || len(d) > 253 || !strings.Contains(d, ".") {
		return "", false
	}
	for _, label := range strings.Split(d, ".") {
		if len(label) == 0 || len(label) > 63 {
			return "", false
		}
		for i, c := range label {
			ok := c >= 'a' && c <= 'z' || c >= '0' && c <= '9' ||
				c == '-' && i != 0 && i != len(label)-1
			if !ok {
				return "", false
			}
		}
	}
	return d, true
}

// handleAddDomain: POST /v1/sites/{slug}/domains {"domain":"..."}
// attaches an unverified domain and returns the TXT proof to publish.
func (s *Server) handleAddDomain(w http.ResponseWriter, r *http.Request) {
	if s.badAPI(w, r) || !s.requireWritable(w) {
		return
	}
	defer s.releaseConn(s.clientIP(r))
	slug := r.PathValue("slug")
	var body struct {
		Domain string `json:"domain"`
	}
	if err := readJSONBody(w, r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "bad body")
		return
	}
	domain, ok := normalizeDomain(body.Domain)
	if !ok {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadDomain, "invalid domain")
		return
	}
	pub, ok := s.authedREST(w, r, "DOMAIN", slug+"|"+domain)
	if !ok {
		return
	}
	lk := s.siteLock(slug)
	lk.Lock()
	defer lk.Unlock()
	meta, err := s.store.GetSite(slug)
	if err != nil || meta == nil {
		writeErr(w, http.StatusNotFound, protocol.CodeNotFound, "not found")
		return
	}
	if meta.Owner != pub {
		writeErr(w, http.StatusForbidden, protocol.CodeBadSig, "not your site")
		return
	}
	if _, exists := meta.Domain(domain); !exists {
		// Cap counts domains across all of the identity's sites.
		sites, err := s.store.ListSites()
		if err != nil {
			writeErr(w, http.StatusInternalServerError, protocol.CodeInternal, "store failed")
			return
		}
		var total int
		for _, m := range sites {
			if m.Owner == pub {
				total += len(m.Domains)
			}
		}
		if total >= s.cfg.MaxDomains {
			writeErr(w, http.StatusForbidden, protocol.CodeQuotaExceeded, "domain limit reached")
			return
		}
		// Refuse to attach a domain already verified to another site.
		if other, taken := s.store.ResolveDomain(domain); taken && other != slug {
			writeErr(w, http.StatusConflict, protocol.CodeConflict, "domain in use")
			return
		}
		meta.Domains = append(meta.Domains, store.DomainEntry{Name: domain})
		meta.Updated = s.now()
		if err := s.store.PutSite(meta); err != nil {
			writeErr(w, http.StatusInternalServerError, protocol.CodeInternal, "store failed")
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"domain":      domain,
		"verified":    false,
		"txt_name":    verifyPrefix + domain,
		"txt_value":   s.verifyToken(slug, domain),
		"verify_with": "POST /v1/sites/" + slug + "/domains/verify",
	})
}

// handleVerifyDomain: POST /v1/sites/{slug}/domains/verify {"domain":"..."}
// looks up the TXT proof and activates the mapping.
func (s *Server) handleVerifyDomain(w http.ResponseWriter, r *http.Request) {
	if s.badAPI(w, r) || !s.requireWritable(w) {
		return
	}
	defer s.releaseConn(s.clientIP(r))
	slug := r.PathValue("slug")
	var body struct {
		Domain string `json:"domain"`
	}
	if err := readJSONBody(w, r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "bad body")
		return
	}
	domain, ok := normalizeDomain(body.Domain)
	if !ok {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadDomain, "invalid domain")
		return
	}
	pub, ok := s.authedREST(w, r, "DOMAIN_VERIFY", slug+"|"+domain)
	if !ok {
		return
	}
	lk := s.siteLock(slug)
	lk.Lock()
	defer lk.Unlock()
	meta, err := s.store.GetSite(slug)
	if err != nil || meta == nil {
		writeErr(w, http.StatusNotFound, protocol.CodeNotFound, "not found")
		return
	}
	if meta.Owner != pub {
		writeErr(w, http.StatusForbidden, protocol.CodeBadSig, "not your site")
		return
	}
	entry, exists := meta.Domain(domain)
	if !exists {
		writeErr(w, http.StatusNotFound, protocol.CodeNotFound, "domain not attached")
		return
	}
	if entry.Verified {
		writeJSON(w, http.StatusOK, map[string]any{"domain": domain, "verified": true})
		return
	}
	want := s.verifyToken(slug, domain)
	txts, err := lookupTXT(s.resolver, verifyPrefix+domain)
	if err != nil {
		writeErr(w, http.StatusBadGateway, protocol.CodeBadDomain, "TXT lookup failed: "+err.Error())
		return
	}
	found := false
	for _, t := range txts {
		if t == want {
			found = true
		}
	}
	if !found {
		writeErr(w, http.StatusPreconditionFailed, protocol.CodeBadDomain,
			"TXT record "+verifyPrefix+domain+" does not contain the expected value")
		return
	}
	if err := s.store.SetDomain(domain, slug); err != nil {
		writeErr(w, http.StatusConflict, protocol.CodeConflict, "domain in use")
		return
	}
	for i := range meta.Domains {
		if meta.Domains[i].Name == domain {
			meta.Domains[i].Verified = true
		}
	}
	meta.Updated = s.now()
	if err := s.store.PutSite(meta); err != nil {
		writeErr(w, http.StatusInternalServerError, protocol.CodeInternal, "store failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"domain": domain, "verified": true})
}

// handleDeleteDomain: DELETE /v1/sites/{slug}/domains/{domain}
func (s *Server) handleDeleteDomain(w http.ResponseWriter, r *http.Request) {
	if s.badAPI(w, r) || !s.requireWritable(w) {
		return
	}
	defer s.releaseConn(s.clientIP(r))
	slug := r.PathValue("slug")
	domain, ok := normalizeDomain(r.PathValue("domain"))
	if !ok {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadDomain, "invalid domain")
		return
	}
	pub, ok := s.authedREST(w, r, "DOMAIN_DEL", slug+"|"+domain)
	if !ok {
		return
	}
	lk := s.siteLock(slug)
	lk.Lock()
	defer lk.Unlock()
	meta, err := s.store.GetSite(slug)
	if err != nil || meta == nil {
		writeErr(w, http.StatusNotFound, protocol.CodeNotFound, "not found")
		return
	}
	if meta.Owner != pub {
		writeErr(w, http.StatusForbidden, protocol.CodeBadSig, "not your site")
		return
	}
	kept := meta.Domains[:0]
	var removed store.DomainEntry
	for _, d := range meta.Domains {
		if d.Name == domain {
			removed = d
			continue
		}
		kept = append(kept, d)
	}
	if removed.Name == "" {
		writeErr(w, http.StatusNotFound, protocol.CodeNotFound, "domain not attached")
		return
	}
	meta.Domains = kept
	meta.Updated = s.now()
	if removed.Verified {
		if err := s.store.DeleteDomain(domain); err != nil {
			writeErr(w, http.StatusInternalServerError, protocol.CodeInternal, "store failed")
			return
		}
	}
	if err := s.store.PutSite(meta); err != nil {
		writeErr(w, http.StatusInternalServerError, protocol.CodeInternal, "store failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
