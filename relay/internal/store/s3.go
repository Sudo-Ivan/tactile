package store

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Sudo-Ivan/tactile/relay/internal/blob"
	"github.com/Sudo-Ivan/tactile/relay/internal/identity"
	"github.com/Sudo-Ivan/tactile/relay/internal/s3client"
)

type s3Entry struct {
	key       string
	expiresAt int64
	size      int64
	sig       identity.Sig
}

// S3 is the S3-compatible Backend. Object keys carry the expiry so a plain
// ListObjectsV2 rebuilds the index without per-object HEAD calls:
//
//	<identity-hex>/<blob-hex>-e<expiresAt>.blob
//
// Bodies use the same blob envelope format as the filesystem backend, so
// data is portable between backends. The index is in-memory and rebuilt by
// listing objects at startup; crash recovery is automatic since blobs are
// immutable objects.
type S3 struct {
	cli        *s3client.Client
	maxPayload int
	mu         sync.RWMutex
	index      map[identity.ID]map[[32]byte]s3Entry
	usage      map[identity.ID]*Usage
	totalBytes int64
}

// NewS3 builds the backend and rebuilds the index by listing the bucket.
func NewS3(cli *s3client.Client, maxPayload int) (*S3, error) {
	s := &S3{
		cli:        cli,
		maxPayload: maxPayload,
		index:      make(map[identity.ID]map[[32]byte]s3Entry),
		usage:      make(map[identity.ID]*Usage),
	}
	if err := s.load(context.Background()); err != nil {
		return nil, err
	}
	return s, nil
}

// s3Key encodes a record into an object key with embedded expiry.
func s3Key(id identity.ID, r *blob.Record) string {
	return fmt.Sprintf("%x/%x-e%d.blob", id, r.ID, r.ExpiresAt)
}

// parseS3Key decodes "<idHex>/<bidHex>-e<expiry>.blob".
func parseS3Key(key string) (identity.ID, [32]byte, int64, bool) {
	var id identity.ID
	var bid [32]byte
	parts := strings.SplitN(key, "/", 2)
	if len(parts) != 2 || len(parts[0]) != 64 {
		return id, bid, 0, false
	}
	idBytes := make([]byte, 32)
	if _, err := hexDecode(idBytes, parts[0]); err != nil {
		return id, bid, 0, false
	}
	copy(id[:], idBytes)
	name := strings.TrimSuffix(parts[1], ".blob")
	i := strings.LastIndex(name, "-e")
	if i < 0 || len(name[:i]) != 64 {
		return id, bid, 0, false
	}
	exp, err := strconv.ParseInt(name[i+2:], 10, 64)
	if err != nil {
		return id, bid, 0, false
	}
	if _, err := hexDecode(bid[:], name[:i]); err != nil {
		return id, bid, 0, false
	}
	return id, bid, exp, true
}

func hexDecode(dst []byte, s string) (int, error) {
	if len(s) != len(dst)*2 {
		return 0, errors.New("bad hex length")
	}
	for i := range dst {
		var v byte
		for _, c := range s[2*i : 2*i+2] {
			v <<= 4
			switch {
			case c >= '0' && c <= '9':
				v |= byte(c - '0')
			case c >= 'a' && c <= 'f':
				v |= byte(c-'a') + 10
			default:
				return 0, errors.New("bad hex")
			}
		}
		dst[i] = v
	}
	return len(dst), nil
}

func (s *S3) load(ctx context.Context) error {
	objs, err := s.cli.ListObjects(ctx, "")
	if err != nil {
		return err
	}
	for _, o := range objs {
		id, bid, exp, ok := parseS3Key(o.Key)
		if !ok {
			continue
		}
		// The signature lives in the blob header, not the key. It is
		// fetched lazily when the blob is first served; until then the
		// index carries a zero sig which is fine for listings.
		s.indexAdd(id, bid, s3Entry{key: o.Key, expiresAt: exp, size: o.Size})
	}
	return nil
}

func (s *S3) indexAdd(id identity.ID, bid [32]byte, e s3Entry) {
	if s.index[id] == nil {
		s.index[id] = make(map[[32]byte]s3Entry)
	}
	s.index[id][bid] = e
	u := s.usage[id]
	if u == nil {
		u = &Usage{}
		s.usage[id] = u
	}
	u.Bytes += e.size
	u.Count++
	s.totalBytes += e.size
}

// PutWithin stores a record only if it fits the per-identity and global
// caps. The check and the index write happen under the same lock.
func (s *S3) PutWithin(r *blob.Record, identityCap, totalCap int64) error {
	id := identity.IDOf(r.Identity)
	s.mu.Lock()
	if _, ok := s.index[id][r.ID]; ok {
		s.mu.Unlock()
		return blob.ErrExists
	}
	if u := s.usage[id]; u != nil && u.Bytes+r.Size() > identityCap {
		s.mu.Unlock()
		return ErrQuotaExceeded
	}
	if s.totalBytes+r.Size() > totalCap {
		s.mu.Unlock()
		return ErrStorageFull
	}
	s.mu.Unlock()

	var buf bytes.Buffer
	buf.Grow(int(r.Size()))
	if err := blob.Marshal(&buf, r); err != nil {
		return err
	}
	key := s3Key(id, r)
	if err := s.cli.PutObject(context.Background(), key, buf.Bytes(), nil); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.indexAdd(id, r.ID, s3Entry{key: key, expiresAt: r.ExpiresAt, size: r.Size(), sig: r.Sig})
	return nil
}

// Put stores a record without quota checks.
func (s *S3) Put(r *blob.Record) error {
	return s.PutWithin(r, 1<<62, 1<<62)
}

// lookup resolves a live entry or reports not-found/expired.
func (s *S3) lookup(pub identity.PubKey, bid [32]byte, now int64) (identity.ID, s3Entry, error) {
	id := identity.IDOf(pub)
	s.mu.RLock()
	e, ok := s.index[id][bid]
	s.mu.RUnlock()
	if !ok {
		return id, s3Entry{}, blob.ErrNotFound
	}
	if e.expiresAt <= now {
		_ = s.deleteKey(id, bid)
		return id, s3Entry{}, blob.ErrExpired
	}
	return id, e, nil
}

// Get returns a live record.
func (s *S3) Get(pub identity.PubKey, bid [32]byte, now int64) (*blob.Record, error) {
	_, e, err := s.lookup(pub, bid, now)
	if err != nil {
		return nil, err
	}
	body, _, notFound, err := s.cli.GetObject(context.Background(), e.key, "")
	if err != nil {
		return nil, err
	}
	if notFound {
		_ = s.deleteKey(identity.IDOf(pub), bid)
		return nil, blob.ErrNotFound
	}
	return blob.Unmarshal(bytes.NewReader(body), s.maxPayload)
}

// GetRange reads payload bytes [start, end) via an S3 range request
// covering the payload region of the envelope.
func (s *S3) GetRange(pub identity.PubKey, bid [32]byte, start, end, now int64) ([]byte, int64, error) {
	_, e, err := s.lookup(pub, bid, now)
	if err != nil {
		return nil, 0, err
	}
	total := e.size - blob.HeaderSize
	if start < 0 || start >= total || end <= start {
		return nil, total, blob.ErrBadID
	}
	if end > total {
		end = total
	}
	rng := fmt.Sprintf("bytes=%d-%d", blob.HeaderSize+start, blob.HeaderSize+end-1)
	body, _, notFound, err := s.cli.GetObject(context.Background(), e.key, rng)
	if err != nil {
		return nil, total, err
	}
	if notFound {
		return nil, total, blob.ErrNotFound
	}
	return body, total, nil
}

// List returns live metadata for an identity, sorted by id.
func (s *S3) List(pub identity.PubKey, now int64) []Meta {
	id := identity.IDOf(pub)
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Meta, 0, len(s.index[id]))
	for bid, e := range s.index[id] {
		if e.expiresAt <= now {
			continue
		}
		out = append(out, Meta{ID: bid, Size: e.size - blob.HeaderSize, ExpiresAt: e.expiresAt, Sig: e.sig})
	}
	sort.Slice(out, func(i, j int) bool {
		return bytes.Compare(out[i].ID[:], out[j].ID[:]) < 0
	})
	return out
}

// Delete removes a blob.
func (s *S3) Delete(pub identity.PubKey, bid [32]byte) error {
	return s.deleteKey(identity.IDOf(pub), bid)
}

func (s *S3) deleteKey(id identity.ID, bid [32]byte) error {
	s.mu.RLock()
	e, ok := s.index[id][bid]
	s.mu.RUnlock()
	if !ok {
		return blob.ErrNotFound
	}
	if err := s.cli.DeleteObject(context.Background(), e.key); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.index[id], bid)
	if u := s.usage[id]; u != nil {
		u.Bytes -= e.size
		u.Count--
	}
	s.totalBytes -= e.size
	return nil
}

// Usage returns per-identity usage.
func (s *S3) Usage(pub identity.PubKey) Usage {
	return s.UsageID(identity.IDOf(pub))
}

// UsageID returns per-identity usage by identity ID.
func (s *S3) UsageID(id identity.ID) Usage {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if u := s.usage[id]; u != nil {
		return *u
	}
	return Usage{}
}

// TotalBytes returns bytes stored across all identities.
func (s *S3) TotalBytes() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.totalBytes
}

// Sweep deletes expired objects. Returns the count removed.
func (s *S3) Sweep(now int64) int {
	s.mu.RLock()
	var dead []struct {
		id  identity.ID
		bid [32]byte
	}
	for id, m := range s.index {
		for bid, e := range m {
			if e.expiresAt <= now {
				dead = append(dead, struct {
					id  identity.ID
					bid [32]byte
				}{id, bid})
			}
		}
	}
	s.mu.RUnlock()
	for _, d := range dead {
		_ = s.deleteKey(d.id, d.bid)
	}
	return len(dead)
}

// Sweeper runs Sweep every interval until the channel closes.
func (s *S3) Sweeper(interval time.Duration, stop <-chan struct{}) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case now := <-t.C:
			s.Sweep(now.Unix())
		}
	}
}

// Close releases resources. The S3 backend holds none; present to satisfy
// Backend.
func (s *S3) Close() error { return nil }
