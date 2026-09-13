package server

import (
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Sudo-Ivan/tactile/relay/internal/blob"
	"github.com/Sudo-Ivan/tactile/relay/internal/identity"
	"github.com/Sudo-Ivan/tactile/relay/internal/protocol"
	"github.com/Sudo-Ivan/tactile/relay/internal/store"
)

// REST auth headers. GET/DELETE requests are authorized by an Ed25519
// signature over a domain-separated method string and a fresh timestamp, so
// a captured request cannot be replayed outside the window.
const (
	hdrIdentity  = "X-Tactile-Identity"
	hdrBlobID    = "X-Tactile-Blob-Id"
	hdrTTL       = "X-Tactile-Ttl"
	hdrTimestamp = "X-Tactile-Timestamp"
	hdrSig       = "X-Tactile-Signature"

	restTimeWindow = 2 * time.Minute
)

func restIdentity(r *http.Request) (identity.PubKey, error) {
	return decodePubKey(r.Header.Get(hdrIdentity))
}

func restSig(r *http.Request) (identity.Sig, error) {
	return decodeSig(r.Header.Get(hdrSig))
}

// decodeBlobIDURL decodes a URL-safe base64 blob id from a path segment.
// Standard base64 can contain '/', which would break routing.
func decodeBlobIDURL(s string) ([32]byte, error) {
	var out [32]byte
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		// Accept padded form too.
		if b, err = base64.URLEncoding.DecodeString(s); err != nil {
			return out, errBadSize
		}
	}
	if len(b) != 32 {
		return out, errBadSize
	}
	copy(out[:], b)
	return out, nil
}

// checkFreshSig verifies a timestamped REST signature over
// DomainREST || method || id || timestamp.
func checkFreshSig(r *http.Request, pub identity.PubKey, method string, id []byte) error {
	ts, err := strconv.ParseInt(r.Header.Get(hdrTimestamp), 10, 64)
	if err != nil {
		return errors.New("missing timestamp")
	}
	now := time.Now().Unix()
	if ts < now-int64(restTimeWindow.Seconds()) || ts > now+int64(restTimeWindow.Seconds()) {
		return errors.New("timestamp outside window")
	}
	sig, err := restSig(r)
	if err != nil {
		return errors.New("bad signature")
	}
	tsb := strconv.AppendInt(nil, ts, 10)
	msg := make([]byte, 0, len(protocol.DomainREST)+len(method)+len(id)+len(tsb))
	msg = append(msg, protocol.DomainREST...)
	msg = append(msg, method...)
	msg = append(msg, id...)
	msg = append(msg, tsb...)
	if !identity.Verify(pub, msg, sig) {
		return errors.New("signature check failed")
	}
	return nil
}

// handlePut: PUT /v1/blobs with signed headers and a raw ciphertext body.
func (s *Server) handlePut(w http.ResponseWriter, r *http.Request) {
	if !s.checkUA(w, r) {
		return
	}
	if !s.connRL.Allow(s.clientIP(r)) {
		writeErr(w, http.StatusTooManyRequests, protocol.CodeRateLimited, "rate limited")
		return
	}
	pub, err := restIdentity(r)
	if err != nil {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "bad identity header")
		return
	}
	if !s.allowIdentity(pub) {
		writeErr(w, http.StatusForbidden, protocol.CodeNotAllowed, "identity not allowed")
		return
	}
	id, err := decodeBlobID(r.Header.Get(hdrBlobID))
	if err != nil {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "bad blob id header")
		return
	}
	ttl, err := strconv.ParseInt(r.Header.Get(hdrTTL), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "bad ttl header")
		return
	}
	sig, err := restSig(r)
	if err != nil {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "bad signature header")
		return
	}
	maxBlob := int64(s.cfg.MaxBlobSize)
	r.Body = http.MaxBytesReader(w, r.Body, maxBlob+1)
	payload, err := io.ReadAll(r.Body)
	if err != nil || len(payload) == 0 || int64(len(payload)) > maxBlob {
		writeErr(w, http.StatusRequestEntityTooLarge, protocol.CodeTooLarge, "payload over max_blob_size")
		return
	}
	if !identity.Verify(pub, blob.SigMessage(id, ttl, payload), sig) {
		writeErr(w, http.StatusForbidden, protocol.CodeBadSig, "signature check failed")
		return
	}
	if min := int64(s.cfg.MinTTL.Seconds()); ttl < min {
		ttl = min
	}
	if max := int64(s.cfg.MaxTTL.Seconds()); ttl > max {
		ttl = max
	}
	rec := &blob.Record{
		ID:        id,
		Identity:  pub,
		Payload:   payload,
		Sig:       sig,
		ExpiresAt: s.now() + ttl,
	}
	err = s.store.PutWithin(rec, s.cfg.IdentityQuota, s.cfg.MaxStorage)
	switch {
	case err == nil:
	case errors.Is(err, store.ErrQuotaExceeded):
		writeErr(w, http.StatusForbidden, protocol.CodeQuotaExceeded, "identity quota exceeded")
		return
	case errors.Is(err, store.ErrStorageFull):
		writeErr(w, http.StatusInsufficientStorage, protocol.CodeStorageFull, "relay storage full")
		return
	case errors.Is(err, blob.ErrExists):
		writeErr(w, http.StatusConflict, protocol.CodeBadRequest, "blob id exists")
		return
	default:
		writeErr(w, http.StatusInternalServerError, protocol.CodeInternal, "store failed")
		return
	}
	s.hub.Publish(identity.IDOf(pub), mustJSON(protocol.Event{
		Type: protocol.TypeEvent, Kind: protocol.EventBlobAdded, ID: b64(id[:]),
	}), "")
	writeJSON(w, http.StatusCreated, map[string]any{
		"type": protocol.TypePutOK, "id": b64(id[:]), "expires_at": rec.ExpiresAt,
	})
}

// blobLookup resolves an authed GET/HEAD target.
func (s *Server) blobLookup(w http.ResponseWriter, r *http.Request, method string) (identity.PubKey, [32]byte, bool) {
	var zero [32]byte
	pub, err := restIdentity(r)
	if err != nil {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "bad identity header")
		return pub, zero, false
	}
	if !s.allowIdentity(pub) {
		writeErr(w, http.StatusForbidden, protocol.CodeNotAllowed, "identity not allowed")
		return pub, zero, false
	}
	id, err := decodeBlobIDURL(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "bad blob id")
		return pub, zero, false
	}
	if err := checkFreshSig(r, pub, method, id[:]); err != nil {
		writeErr(w, http.StatusForbidden, protocol.CodeBadSig, err.Error())
		return pub, zero, false
	}
	return pub, id, true
}

// handleGet: GET /v1/blobs/{id}
//
// JSON mode returns {payload, expires_at, sig}. Raw mode (?raw=1 or
// Accept: application/octet-stream) returns the ciphertext body with an
// ETag, Cache-Control: immutable, and single-range support (206/416) for
// resumable transfers of large blobs.
func (s *Server) handleGet(w http.ResponseWriter, r *http.Request) {
	if !s.checkUA(w, r) {
		return
	}
	if !s.connRL.Allow(s.clientIP(r)) {
		writeErr(w, http.StatusTooManyRequests, protocol.CodeRateLimited, "rate limited")
		return
	}
	pub, id, ok := s.blobLookup(w, r, "GET")
	if !ok {
		return
	}
	raw := r.URL.Query().Get("raw") == "1" ||
		strings.Contains(r.Header.Get("Accept"), "application/octet-stream")

	// Range mode needs only the requested window.
	if raw && r.Header.Get("Range") != "" {
		s.serveRange(w, r, pub, id)
		return
	}

	rec, err := s.store.Get(pub, id, s.now())
	if err != nil {
		writeStoreGetErr(w, err)
		return
	}
	etag := `"` + b64(rec.Sig[:16]) + `"`
	if raw && matchETag(r.Header.Get("If-None-Match"), etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	if !raw {
		writeJSON(w, http.StatusOK, map[string]any{
			"type": protocol.TypeBlob, "id": b64(id[:]),
			"payload": b64(rec.Payload), "expires_at": rec.ExpiresAt, "sig": b64(rec.Sig[:]),
		})
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "immutable")
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("X-Tactile-Expires-At", strconv.FormatInt(rec.ExpiresAt, 10))
	w.Header().Set("X-Tactile-Sig", b64(rec.Sig[:]))
	w.WriteHeader(http.StatusOK)
	// #nosec G705 -- content is opaque ciphertext served as
	// application/octet-stream, never rendered as HTML.
	_, _ = w.Write(rec.Payload)
}

// serveRange answers a raw GET carrying a Range header.
func (s *Server) serveRange(w http.ResponseWriter, r *http.Request, pub identity.PubKey, id [32]byte) {
	start, end, ok := parseRange(r.Header.Get("Range"))
	if !ok {
		writeErr(w, http.StatusRequestedRangeNotSatisfiable, protocol.CodeBadRequest, "bad range")
		return
	}
	if start < 0 {
		// Suffix range: resolve total with a probe, then fetch the tail.
		_, total, err := s.store.GetRange(pub, id, 0, 0, s.now())
		if err != nil {
			if errors.Is(err, blob.ErrBadID) {
				w.Header().Set("Content-Range", "bytes */"+strconv.FormatInt(total, 10))
				writeErr(w, http.StatusRequestedRangeNotSatisfiable, protocol.CodeBadRequest, "range out of bounds")
				return
			}
			writeStoreGetErr(w, err)
			return
		}
		start = total + start
		if start < 0 {
			start = 0
		}
		end = total
	}
	payload, total, err := s.store.GetRange(pub, id, start, end, s.now())
	if err != nil {
		if errors.Is(err, blob.ErrBadID) {
			w.Header().Set("Content-Range", "bytes */"+strconv.FormatInt(total, 10))
			writeErr(w, http.StatusRequestedRangeNotSatisfiable, protocol.CodeBadRequest, "range out of bounds")
			return
		}
		writeStoreGetErr(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Range", "bytes "+strconv.FormatInt(start, 10)+"-"+
		strconv.FormatInt(start+int64(len(payload))-1, 10)+"/"+strconv.FormatInt(total, 10))
	w.Header().Set("Accept-Ranges", "bytes")
	w.WriteHeader(http.StatusPartialContent)
	// #nosec G705 -- content is opaque ciphertext served as
	// application/octet-stream, never rendered as HTML.
	_, _ = w.Write(payload)
}

// parseRange parses a single-range "bytes=a-b", "bytes=a-" or
// "bytes=-b" header. Suffix ranges return a negative start as a marker;
// the caller clamps against the real total.
func parseRange(h string) (start, end int64, ok bool) {
	const p = "bytes="
	if !strings.HasPrefix(h, p) || strings.Contains(h, ",") {
		return 0, 0, false
	}
	spec := h[len(p):]
	i := strings.IndexByte(spec, '-')
	if i < 0 {
		return 0, 0, false
	}
	a, b := spec[:i], spec[i+1:]
	if a == "" {
		// Suffix: last b bytes. Caller sees start=-b.
		n, err := strconv.ParseInt(b, 10, 64)
		if err != nil || n <= 0 {
			return 0, 0, false
		}
		return -n, 0, true
	}
	start, err1 := strconv.ParseInt(a, 10, 64)
	if err1 != nil || start < 0 {
		return 0, 0, false
	}
	if b == "" {
		return start, 1 << 62, true // open-ended; store clamps
	}
	end, err2 := strconv.ParseInt(b, 10, 64)
	if err2 != nil || end < start {
		return 0, 0, false
	}
	return start, end + 1, true // store takes [start, end)
}

// matchETag reports whether an If-None-Match header contains etag.
func matchETag(inm, etag string) bool {
	for _, t := range strings.Split(inm, ",") {
		if strings.TrimSpace(t) == etag || strings.TrimSpace(t) == "*" {
			return true
		}
	}
	return false
}

// handleHead: HEAD /v1/blobs/{id} returns metadata without the body.
func (s *Server) handleHead(w http.ResponseWriter, r *http.Request) {
	if !s.checkUA(w, r) {
		return
	}
	if !s.connRL.Allow(s.clientIP(r)) {
		w.WriteHeader(http.StatusTooManyRequests)
		return
	}
	pub, id, ok := s.blobLookup(w, r, "HEAD")
	if !ok {
		return
	}
	items := s.store.List(pub, s.now())
	for _, m := range items {
		if m.ID == id {
			w.Header().Set("X-Tactile-Expires-At", strconv.FormatInt(m.ExpiresAt, 10))
			w.Header().Set("X-Tactile-Sig", b64(m.Sig[:]))
			w.Header().Set("Content-Length", strconv.FormatInt(m.Size, 10))
			w.Header().Set("Accept-Ranges", "bytes")
			w.WriteHeader(http.StatusOK)
			return
		}
	}
	writeErr(w, http.StatusNotFound, protocol.CodeNotFound, "not found")
}

func writeStoreGetErr(w http.ResponseWriter, err error) {
	if errors.Is(err, blob.ErrExpired) {
		writeErr(w, http.StatusGone, protocol.CodeExpired, "blob expired")
		return
	}
	writeErr(w, http.StatusNotFound, protocol.CodeNotFound, "not found")
}

// handleList: GET /v1/blobs
func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	if !s.checkUA(w, r) {
		return
	}
	if !s.connRL.Allow(s.clientIP(r)) {
		writeErr(w, http.StatusTooManyRequests, protocol.CodeRateLimited, "rate limited")
		return
	}
	pub, err := restIdentity(r)
	if err != nil {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "bad identity header")
		return
	}
	if !s.allowIdentity(pub) {
		writeErr(w, http.StatusForbidden, protocol.CodeNotAllowed, "identity not allowed")
		return
	}
	if err := checkFreshSig(r, pub, "LIST", nil); err != nil {
		writeErr(w, http.StatusForbidden, protocol.CodeBadSig, err.Error())
		return
	}
	items := s.store.List(pub, s.now())
	out := make([]map[string]any, 0, len(items))
	for _, m := range items {
		out = append(out, map[string]any{
			"id": b64(m.ID[:]), "size": m.Size, "expires_at": m.ExpiresAt,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"type": protocol.TypeBlobs, "items": out})
}

// handleDelete: DELETE /v1/blobs/{id}
func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request) {
	if !s.checkUA(w, r) {
		return
	}
	if !s.connRL.Allow(s.clientIP(r)) {
		writeErr(w, http.StatusTooManyRequests, protocol.CodeRateLimited, "rate limited")
		return
	}
	pub, err := restIdentity(r)
	if err != nil {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "bad identity header")
		return
	}
	if !s.allowIdentity(pub) {
		writeErr(w, http.StatusForbidden, protocol.CodeNotAllowed, "identity not allowed")
		return
	}
	id, err := decodeBlobIDURL(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "bad blob id")
		return
	}
	sig, err := restSig(r)
	if err != nil {
		writeErr(w, http.StatusBadRequest, protocol.CodeBadRequest, "bad signature header")
		return
	}
	if !identity.Verify(pub, blob.DelSigMessage(id), sig) {
		writeErr(w, http.StatusForbidden, protocol.CodeBadSig, "signature check failed")
		return
	}
	if err := s.store.Delete(pub, id); err != nil {
		writeErr(w, http.StatusNotFound, protocol.CodeNotFound, "not found")
		return
	}
	s.hub.Publish(identity.IDOf(pub), mustJSON(protocol.Event{
		Type: protocol.TypeEvent, Kind: protocol.EventBlobRemoved, ID: b64(id[:]),
	}), "")
	w.WriteHeader(http.StatusNoContent)
}

func mustJSON(v any) []byte {
	b, _ := protocol.Encode(v)
	return b
}
