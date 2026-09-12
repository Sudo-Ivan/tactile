package server

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/Sudo-Ivan/tactile/publish/internal/bundle"
	"github.com/Sudo-Ivan/tactile/publish/internal/identity"
	"github.com/Sudo-Ivan/tactile/publish/internal/protocol"
	"github.com/Sudo-Ivan/tactile/publish/internal/store"
	"github.com/Sudo-Ivan/tactile/publish/internal/tier"
)

// REST auth headers, same scheme as the sync relay: an Ed25519 signature
// over a domain-separated message with a fresh timestamp, so a captured
// request cannot be replayed outside the window.
const (
	hdrIdentity  = "X-Tactile-Identity"
	hdrTimestamp = "X-Tactile-Timestamp"
	hdrSig       = "X-Tactile-Signature"
	hdrPoWNonce  = "X-Tactile-Pow-Nonce"
	// #nosec G101 -- header name, not a credential.
	hdrToken = "X-Tactile-Token"

	restTimeWindow = 2 * time.Minute
)

var slugRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,62}$`)

var errBadSize = errors.New("bad field size")

func restIdentity(r *http.Request) (identity.PubKey, error) {
	var pub identity.PubKey
	b, err := base64.StdEncoding.DecodeString(r.Header.Get(hdrIdentity))
	if err != nil || len(b) != identity.PubKeySize {
		return pub, errBadSize
	}
	copy(pub[:], b)
	return pub, nil
}

func restSig(r *http.Request) (identity.Sig, error) {
	var sig identity.Sig
	b, err := base64.StdEncoding.DecodeString(r.Header.Get(hdrSig))
	if err != nil || len(b) != identity.SigSize {
		return sig, errBadSize
	}
	copy(sig[:], b)
	return sig, nil
}

// freshTimestamp extracts and bounds-checks the request timestamp.
func freshTimestamp(r *http.Request) (int64, error) {
	ts, err := strconv.ParseInt(r.Header.Get(hdrTimestamp), 10, 64)
	if err != nil {
		return 0, errors.New("missing timestamp")
	}
	now := time.Now().Unix()
	if ts < now-int64(restTimeWindow.Seconds()) || ts > now+int64(restTimeWindow.Seconds()) {
		return 0, errors.New("timestamp outside window")
	}
	return ts, nil
}

// authed verifies the common signature scheme and returns the caller's
// public key. msg is the fully assembled signed message.
func (s *Server) authed(w http.ResponseWriter, r *http.Request, msg []byte) (identity.PubKey, bool) {
	var pub identity.PubKey
	p, err := restIdentity(r)
	if err != nil {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "bad identity header")
		return pub, false
	}
	sig, err := restSig(r)
	if err != nil {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "bad signature header")
		return pub, false
	}
	if !identity.Verify(p, msg, sig) {
		writeErr(w, http.StatusForbidden, protocol.CodeBadSig, "signature check failed")
		return pub, false
	}
	return p, true
}

// authedREST verifies a DomainREST signature over method || subject || ts.
func (s *Server) authedREST(w http.ResponseWriter, r *http.Request, method, subject string) (identity.PubKey, bool) {
	ts, err := freshTimestamp(r)
	if err != nil {
		writeErr(w, http.StatusForbidden, protocol.CodeBadSig, err.Error())
		return identity.PubKey{}, false
	}
	return s.authed(w, r, protocol.RESTSigMessage(method, subject, ts))
}

// limits is the common limit resolution step for authed requests.
func (s *Server) limits(w http.ResponseWriter, r *http.Request) (tier.Tier, bool) {
	limits, err := s.limitsFor(r.Header.Get(hdrToken))
	if err != nil {
		writeErr(w, http.StatusForbidden, protocol.CodeBadToken, "invalid or expired token")
		return tier.Tier{}, false
	}
	return limits, true
}

func validSlug(slug string) bool { return slugRe.MatchString(slug) }

// readJSONBody decodes a small JSON body with a hard cap.
func readJSONBody(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 8<<10)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}

// handlePutSite: PUT /v1/sites/{slug} creates or updates a site. Creation
// costs proof of work; updates only need the owner signature.
func (s *Server) handlePutSite(w http.ResponseWriter, r *http.Request) {
	if s.badAPI(w, r) || !s.requireWritable(w) {
		return
	}
	defer s.releaseConn(s.clientIP(r))
	slug := r.PathValue("slug")
	if !validSlug(slug) || s.reserved[slug] {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "invalid or reserved slug")
		return
	}
	ts, err := freshTimestamp(r)
	if err != nil {
		writeErr(w, http.StatusForbidden, protocol.CodeBadSig, err.Error())
		return
	}
	pub, ok := s.authed(w, r, protocol.SiteSigMessage(slug, ts))
	if !ok {
		return
	}
	limits, ok := s.limits(w, r)
	if !ok {
		return
	}
	var body struct {
		Title string `json:"title"`
	}
	if r.Body != nil {
		if err := readJSONBody(w, r, &body); err != nil && err != io.EOF {
			writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "bad body")
			return
		}
	}

	lk := s.siteLock(slug)
	lk.Lock()
	defer lk.Unlock()

	meta, err := s.store.GetSite(slug)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, protocol.CodeInternal, "store failed")
		return
	}
	if meta != nil {
		if meta.Owner != pub {
			writeErr(w, http.StatusConflict, protocol.CodeConflict, "slug already claimed")
			return
		}
		meta.Title = body.Title
		meta.Updated = s.now()
		if err := s.store.PutSite(meta); err != nil {
			writeErr(w, http.StatusInternalServerError, protocol.CodeInternal, "store failed")
			return
		}
		writeJSON(w, http.StatusOK, siteJSON(meta))
		return
	}

	// Create path: PoW + site-count cap.
	if s.cfg.PoWBits > 0 {
		nonce, err := base64.StdEncoding.DecodeString(r.Header.Get(hdrPoWNonce))
		if err != nil || !s.checkPoW(pub, nonce) {
			writeErr(w, http.StatusForbidden, protocol.CodeBadPoW,
				"proof of work missing or below difficulty; see GET /v1/challenge")
			return
		}
	}
	usage, err := s.identityUsage(pub)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, protocol.CodeInternal, "store failed")
		return
	}
	if usage.Sites >= limits.MaxSites {
		writeErr(w, http.StatusForbidden, protocol.CodeQuotaExceeded, "site limit reached")
		return
	}
	meta = &store.SiteMeta{
		Slug: slug, Owner: pub, Title: body.Title,
		Created: s.now(), Updated: s.now(),
	}
	if err := s.store.PutSite(meta); err != nil {
		writeErr(w, http.StatusInternalServerError, protocol.CodeInternal, "store failed")
		return
	}
	writeJSON(w, http.StatusCreated, siteJSON(meta))
}

func siteJSON(m *store.SiteMeta) map[string]any {
	doms := make([]map[string]any, 0, len(m.Domains))
	for _, d := range m.Domains {
		doms = append(doms, map[string]any{"domain": d.Name, "verified": d.Verified})
	}
	return map[string]any{
		"slug": m.Slug, "title": m.Title, "created": m.Created,
		"updated": m.Updated, "current": m.Current,
		"deploys": m.Deploys, "domains": doms,
	}
}

// handleGetSite: GET /v1/sites/{slug} returns meta to the owner.
func (s *Server) handleGetSite(w http.ResponseWriter, r *http.Request) {
	if s.badAPI(w, r) {
		return
	}
	defer s.releaseConn(s.clientIP(r))
	slug := r.PathValue("slug")
	pub, ok := s.authedREST(w, r, "GETSITE", slug)
	if !ok {
		return
	}
	meta, err := s.store.GetSite(slug)
	if err != nil || meta == nil {
		writeErr(w, http.StatusNotFound, protocol.CodeNotFound, "not found")
		return
	}
	if meta.Owner != pub {
		writeErr(w, http.StatusForbidden, protocol.CodeBadSig, "not your site")
		return
	}
	writeJSON(w, http.StatusOK, siteJSON(meta))
}

// handleListSites: GET /v1/sites lists the caller's sites.
func (s *Server) handleListSites(w http.ResponseWriter, r *http.Request) {
	if s.badAPI(w, r) {
		return
	}
	defer s.releaseConn(s.clientIP(r))
	pub, ok := s.authedREST(w, r, "LIST", "")
	if !ok {
		return
	}
	sites, err := s.store.ListSites()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, protocol.CodeInternal, "store failed")
		return
	}
	out := make([]map[string]any, 0)
	for _, m := range sites {
		if m.Owner == pub {
			out = append(out, siteJSON(m))
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"sites": out})
}

// handleDeleteSite: DELETE /v1/sites/{slug} removes the site, its deploy
// history and domain mappings. Objects become orphans for the sweeper.
func (s *Server) handleDeleteSite(w http.ResponseWriter, r *http.Request) {
	if s.badAPI(w, r) || !s.requireWritable(w) {
		return
	}
	defer s.releaseConn(s.clientIP(r))
	slug := r.PathValue("slug")
	ts, err := freshTimestamp(r)
	if err != nil {
		writeErr(w, http.StatusForbidden, protocol.CodeBadSig, err.Error())
		return
	}
	pub, ok := s.authed(w, r, protocol.DelSigMessage(slug, ts))
	if !ok {
		return
	}
	meta, err := s.store.GetSite(slug)
	if err != nil || meta == nil {
		writeErr(w, http.StatusNotFound, protocol.CodeNotFound, "not found")
		return
	}
	if meta.Owner != pub {
		writeErr(w, http.StatusForbidden, protocol.CodeBadSig, "not your site")
		return
	}
	lk := s.siteLock(slug)
	lk.Lock()
	defer lk.Unlock()
	if err := s.store.DeleteSite(slug); err != nil {
		writeErr(w, http.StatusInternalServerError, protocol.CodeInternal, "store failed")
		return
	}
	s.mu.Lock()
	delete(s.mcache, slug)
	s.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}

// handleDeploy: POST /v1/sites/{slug}/deploys uploads a tar/tar.gz bundle.
// The signature covers the bundle sha256 so the body cannot be swapped.
func (s *Server) handleDeploy(w http.ResponseWriter, r *http.Request) {
	if s.badAPI(w, r) || !s.requireWritable(w) {
		return
	}
	defer s.releaseConn(s.clientIP(r))
	slug := r.PathValue("slug")
	limits, ok := s.limits(w, r)
	if !ok {
		return
	}
	ts, err := freshTimestamp(r)
	if err != nil {
		writeErr(w, http.StatusForbidden, protocol.CodeBadSig, err.Error())
		return
	}
	pub, err := restIdentity(r)
	if err != nil {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "bad identity header")
		return
	}
	if !s.depRL.Allow(b64(pub[:])) {
		writeErr(w, http.StatusTooManyRequests, protocol.CodeRateLimited, "deploy rate limited")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, limits.MaxBundleBytes+1)
	body, err := io.ReadAll(r.Body)
	if err != nil || int64(len(body)) > limits.MaxBundleBytes || len(body) == 0 {
		writeErr(w, http.StatusRequestEntityTooLarge, protocol.CodeTooLarge, "bundle over max_bundle_bytes")
		return
	}
	sum := sha256.Sum256(body)
	sig, err := restSig(r)
	if err != nil || !identity.Verify(pub, protocol.DeploySigMessage(slug, sum, ts), sig) {
		writeErr(w, http.StatusForbidden, protocol.CodeBadSig, "signature check failed")
		return
	}
	meta, err := s.store.GetSite(slug)
	if err != nil || meta == nil {
		writeErr(w, http.StatusNotFound, protocol.CodeNotFound, "site not found")
		return
	}
	if meta.Owner != pub {
		writeErr(w, http.StatusForbidden, protocol.CodeBadSig, "not your site")
		return
	}
	if s.store.TotalBytes() >= s.cfg.MaxStorage {
		writeErr(w, http.StatusInsufficientStorage, protocol.CodeStorageFull, "node storage full")
		return
	}

	var depBytes int64
	files, opts, err := bundle.Extract(bytes.NewReader(body),
		bundle.Limits{MaxFiles: limits.MaxFiles, MaxFileBytes: limits.MaxFileBytes, MaxSiteBytes: limits.MaxSiteBytes},
		func(f bundle.File, data []byte) error {
			if err := s.store.PutObject(f.Hash, data); err != nil {
				return err
			}
			depBytes += f.Size
			return nil
		})
	if err != nil {
		code := protocol.CodeBadBundle
		if errors.Is(err, bundle.ErrTooMany) || errors.Is(err, bundle.ErrFileBig) ||
			errors.Is(err, bundle.ErrSiteBig) {
			code = protocol.CodeTooLarge
		}
		writeErr(w, http.StatusBadRequest, code, err.Error())
		return
	}

	var r4 [4]byte
	_, _ = rand.Read(r4[:])
	dep := &store.Deploy{
		ID:      fmt.Sprintf("%x-%x", s.now(), r4[:]),
		Slug:    slug,
		Created: s.now(),
		Bytes:   depBytes,
		Options: opts,
	}
	for _, f := range files {
		dep.Files = append(dep.Files, store.FileEntry{
			Path: f.Path, Hash: fmt.Sprintf("%x", f.Hash[:]), Size: f.Size, MIME: f.MIME,
		})
	}

	lk := s.siteLock(slug)
	lk.Lock()
	defer lk.Unlock()
	// Refetch under the lock: a concurrent deploy may have committed while
	// this bundle was being extracted.
	meta, err = s.store.GetSite(slug)
	if err != nil || meta == nil {
		writeErr(w, http.StatusNotFound, protocol.CodeNotFound, "site not found")
		return
	}
	if meta.Owner != pub {
		writeErr(w, http.StatusForbidden, protocol.CodeBadSig, "not your site")
		return
	}
	// Quota check happens with the site lock held: deduped identity usage
	// plus this deploy's unique bytes must fit the tier cap.
	usage, err := s.identityUsage(pub)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, protocol.CodeInternal, "store failed")
		return
	}
	existing, _ := s.store.ListObjects()
	var newBytes int64
	for _, f := range files {
		if _, ok := existing[f.Hash]; !ok {
			newBytes += f.Size
		}
	}
	if usage.Bytes+newBytes > limits.QuotaBytes {
		writeErr(w, http.StatusForbidden, protocol.CodeQuotaExceeded, "identity quota exceeded")
		return
	}
	if s.store.TotalBytes()+newBytes > s.cfg.MaxStorage {
		writeErr(w, http.StatusInsufficientStorage, protocol.CodeStorageFull, "node storage full")
		return
	}
	if err := s.store.PutDeploy(dep); err != nil {
		writeErr(w, http.StatusInternalServerError, protocol.CodeInternal, "store failed")
		return
	}
	meta.Deploys = append(meta.Deploys, dep.ID)
	meta.Current = dep.ID
	meta.Updated = s.now()
	for len(meta.Deploys) > s.cfg.KeepDeploys {
		old := meta.Deploys[0]
		meta.Deploys = meta.Deploys[1:]
		_ = s.store.DeleteDeploy(slug, old)
	}
	if err := s.store.PutSite(meta); err != nil {
		writeErr(w, http.StatusInternalServerError, protocol.CodeInternal, "store failed")
		return
	}
	s.mu.Lock()
	delete(s.mcache, slug)
	s.mu.Unlock()
	s.statsDeploys.Add(1)
	writeJSON(w, http.StatusCreated, map[string]any{
		"deploy_id": dep.ID, "files": len(dep.Files), "bytes": dep.Bytes,
		"slug": slug, "url": s.siteURL(slug),
	})
}

func (s *Server) siteURL(slug string) string {
	if s.cfg.BaseDomain != "" {
		return "https://" + slug + "." + s.cfg.BaseDomain
	}
	return "/s/" + slug + "/"
}

// handleListDeploys: GET /v1/sites/{slug}/deploys
func (s *Server) handleListDeploys(w http.ResponseWriter, r *http.Request) {
	if s.badAPI(w, r) {
		return
	}
	defer s.releaseConn(s.clientIP(r))
	slug := r.PathValue("slug")
	pub, ok := s.authedREST(w, r, "DEPLOYS", slug)
	if !ok {
		return
	}
	meta, err := s.store.GetSite(slug)
	if err != nil || meta == nil || meta.Owner != pub {
		writeErr(w, http.StatusNotFound, protocol.CodeNotFound, "not found")
		return
	}
	out := make([]map[string]any, 0, len(meta.Deploys))
	for _, id := range meta.Deploys {
		d, err := s.store.GetDeploy(slug, id)
		if err != nil {
			continue
		}
		out = append(out, map[string]any{
			"id": d.ID, "created": d.Created, "bytes": d.Bytes,
			"files": len(d.Files), "current": d.ID == meta.Current,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"deploys": out})
}

// handleRollback: POST /v1/sites/{slug}/rollback {"deploy_id":"..."}
// flips the current pointer back to a retained deploy.
func (s *Server) handleRollback(w http.ResponseWriter, r *http.Request) {
	if s.badAPI(w, r) || !s.requireWritable(w) {
		return
	}
	defer s.releaseConn(s.clientIP(r))
	slug := r.PathValue("slug")
	var body struct {
		DeployID string `json:"deploy_id"`
	}
	if err := readJSONBody(w, r, &body); err != nil || body.DeployID == "" {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "bad body")
		return
	}
	pub, ok := s.authedREST(w, r, "ROLLBACK", slug+"|"+body.DeployID)
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
	found := false
	for _, id := range meta.Deploys {
		if id == body.DeployID {
			found = true
		}
	}
	if !found {
		writeErr(w, http.StatusNotFound, protocol.CodeNotFound, "deploy not found")
		return
	}
	meta.Current = body.DeployID
	meta.Updated = s.now()
	if err := s.store.PutSite(meta); err != nil {
		writeErr(w, http.StatusInternalServerError, protocol.CodeInternal, "store failed")
		return
	}
	s.mu.Lock()
	delete(s.mcache, slug)
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"slug": slug, "current": meta.Current})
}

// handleUsage: GET /v1/usage returns the caller's deduplicated usage.
func (s *Server) handleUsage(w http.ResponseWriter, r *http.Request) {
	if s.badAPI(w, r) {
		return
	}
	defer s.releaseConn(s.clientIP(r))
	pub, ok := s.authedREST(w, r, "USAGE", "")
	if !ok {
		return
	}
	limits, ok := s.limits(w, r)
	if !ok {
		return
	}
	u, err := s.identityUsage(pub)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, protocol.CodeInternal, "store failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"usage":  u,
		"limits": limits,
	})
}
