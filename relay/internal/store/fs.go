package store

import (
	"bytes"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/Sudo-Ivan/tactile/relay/internal/blob"
	"github.com/Sudo-Ivan/tactile/relay/internal/identity"
)

type fsEntry struct {
	expiresAt int64
	size      int64
	sig       identity.Sig
}

// FS is the filesystem Backend. Blobs live at
// <data>/<identity-hex>/<blob-hex>.blob in the blob package's envelope
// format. An in-memory index is rebuilt by scanning headers at startup,
// which is also the crash recovery path: writes go through a temp file and
// an atomic rename, so a crash can only leave a .tmp file, never a
// truncated blob. Safe for concurrent use.
type FS struct {
	dir        string
	maxPayload int
	mu         sync.RWMutex
	index      map[identity.ID]map[[32]byte]fsEntry
	usage      map[identity.ID]*Usage
	totalBytes int64
}

// OpenFS loads (or creates) a store rooted at dir. maxPayload bounds
// payload size when reading files back.
func OpenFS(dir string, maxPayload int) (*FS, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	s := &FS{
		dir:        dir,
		maxPayload: maxPayload,
		index:      make(map[identity.ID]map[[32]byte]fsEntry),
		usage:      make(map[identity.ID]*Usage),
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *FS) load() error {
	// Root-scoped open keeps the walk safe against symlink swaps on the
	// data dir while it is being scanned.
	root, err := os.OpenRoot(s.dir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()
	return filepath.WalkDir(s.dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(s.dir, path)
		if err != nil {
			return err
		}
		if filepath.Ext(path) != ".blob" {
			// Crash leftovers: drop stale temp files.
			if filepath.Base(path) != "relay.key" {
				_ = root.Remove(rel)
			}
			return nil
		}
		f, err := root.Open(rel)
		if err != nil {
			return fmt.Errorf("store: open %s: %w", path, err)
		}
		m, err := blob.UnmarshalHeader(f)
		_ = f.Close()
		if err != nil {
			// Corrupt file: drop it rather than serving bad data.
			_ = root.Remove(rel)
			return nil
		}
		s.indexAdd(identity.IDOf(m.Identity), m.ID, fsEntry{
			expiresAt: m.ExpiresAt,
			size:      blob.HeaderSize + int64(m.PayloadN),
			sig:       m.Sig,
		})
		return nil
	})
}

func (s *FS) indexAdd(id identity.ID, bid [32]byte, e fsEntry) {
	if s.index[id] == nil {
		s.index[id] = make(map[[32]byte]fsEntry)
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

func idDir(id identity.ID) string {
	return hex.EncodeToString(id[:])
}

func blobPath(dir string, id identity.ID, bid [32]byte) string {
	return filepath.Join(dir, idDir(id), hex.EncodeToString(bid[:])+".blob")
}

// PutWithin stores a record only if it fits the per-identity and global
// caps. The check and the write happen under the same lock so concurrent
// puts cannot oversubscribe.
func (s *FS) PutWithin(r *blob.Record, identityCap, totalCap int64) error {
	id := identity.IDOf(r.Identity)
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.index[id][r.ID]; ok {
		return blob.ErrExists
	}
	if u := s.usage[id]; u != nil && u.Bytes+r.Size() > identityCap {
		return ErrQuotaExceeded
	}
	if s.totalBytes+r.Size() > totalCap {
		return ErrStorageFull
	}
	return s.putLocked(r, id)
}

// Put stores a record without quota checks.
func (s *FS) Put(r *blob.Record) error {
	id := identity.IDOf(r.Identity)
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.index[id][r.ID]; ok {
		return blob.ErrExists
	}
	return s.putLocked(r, id)
}

func (s *FS) putLocked(r *blob.Record, id identity.ID) error {
	dir := filepath.Join(s.dir, idDir(id))
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	path := blobPath(s.dir, id, r.ID)
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(tmp.Name()) }()
	var buf bytes.Buffer
	buf.Grow(int(r.Size()))
	fail := func(err error) error {
		_ = tmp.Close()
		return err
	}
	if err := blob.Marshal(&buf, r); err != nil {
		return fail(err)
	}
	if _, err := tmp.Write(buf.Bytes()); err != nil {
		return fail(err)
	}
	if err := tmp.Sync(); err != nil {
		return fail(err)
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return err
	}
	s.indexAdd(id, r.ID, fsEntry{expiresAt: r.ExpiresAt, size: r.Size(), sig: r.Sig})
	return nil
}

// Get returns a live record. Expired records are treated as absent and
// removed lazily.
func (s *FS) Get(pub identity.PubKey, bid [32]byte, now int64) (*blob.Record, error) {
	id := identity.IDOf(pub)
	s.mu.RLock()
	e, ok := s.index[id][bid]
	s.mu.RUnlock()
	if !ok {
		return nil, blob.ErrNotFound
	}
	if e.expiresAt <= now {
		_ = s.deleteFile(id, bid)
		return nil, blob.ErrExpired
	}
	f, err := os.Open(blobPath(s.dir, id, bid))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, blob.ErrNotFound
		}
		return nil, err
	}
	defer func() { _ = f.Close() }()
	return blob.Unmarshal(f, s.maxPayload)
}

// GetRange reads payload bytes [start, end). end is clamped to the stored
// length. total is the full payload size.
func (s *FS) GetRange(pub identity.PubKey, bid [32]byte, start, end, now int64) ([]byte, int64, error) {
	id := identity.IDOf(pub)
	s.mu.RLock()
	e, ok := s.index[id][bid]
	s.mu.RUnlock()
	if !ok {
		return nil, 0, blob.ErrNotFound
	}
	if e.expiresAt <= now {
		_ = s.deleteFile(id, bid)
		return nil, 0, blob.ErrExpired
	}
	f, err := os.Open(blobPath(s.dir, id, bid))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, 0, blob.ErrNotFound
		}
		return nil, 0, err
	}
	defer func() { _ = f.Close() }()
	hdr, err := blob.UnmarshalHeader(f)
	if err != nil {
		return nil, 0, err
	}
	total := int64(hdr.PayloadN)
	if start < 0 || start >= total || end <= start {
		return nil, total, blob.ErrBadID
	}
	if end > total {
		end = total
	}
	buf := make([]byte, end-start)
	if _, err := f.ReadAt(buf, blob.HeaderSize+start); err != nil && err != io.EOF {
		return nil, total, err
	}
	return buf, total, nil
}

// List returns live metadata for an identity, sorted by id.
func (s *FS) List(pub identity.PubKey, now int64) []Meta {
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
func (s *FS) Delete(pub identity.PubKey, bid [32]byte) error {
	id := identity.IDOf(pub)
	return s.deleteFile(id, bid)
}

func (s *FS) deleteFile(id identity.ID, bid [32]byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.index[id][bid]
	if !ok {
		return blob.ErrNotFound
	}
	err := os.Remove(blobPath(s.dir, id, bid))
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	delete(s.index[id], bid)
	if u := s.usage[id]; u != nil {
		u.Bytes -= e.size
		u.Count--
	}
	s.totalBytes -= e.size
	return nil
}

// Usage returns per-identity usage.
func (s *FS) Usage(pub identity.PubKey) Usage {
	return s.UsageID(identity.IDOf(pub))
}

// UsageID returns per-identity usage by identity ID.
func (s *FS) UsageID(id identity.ID) Usage {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if u := s.usage[id]; u != nil {
		return *u
	}
	return Usage{}
}

// TotalBytes returns bytes stored across all identities.
func (s *FS) TotalBytes() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.totalBytes
}

// Sweep removes all expired blobs. Returns the count removed.
func (s *FS) Sweep(now int64) int {
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
		_ = s.deleteFile(d.id, d.bid)
	}
	return len(dead)
}

// Sweeper runs Sweep every interval until the channel closes.
func (s *FS) Sweeper(interval time.Duration, stop <-chan struct{}) {
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

// Close releases resources. The filesystem store holds none; present to
// satisfy Backend.
func (s *FS) Close() error { return nil }
