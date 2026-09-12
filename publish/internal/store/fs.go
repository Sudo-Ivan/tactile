package store

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// FS is the filesystem Backend. Layout under the data dir:
//
//	meta/sites/<slug>.json          site records
//	meta/domains/<sha256(domain)>   verified domain -> slug
//	sites/<slug>/deploys/<id>.json  immutable deploy manifests
//	objects/<hh>/<sha256>           content-addressed file bytes
//	secrets/<name>                  node-shared secrets
//
// Every write goes through a temp file and atomic rename, so a crash can
// only leave a .tmp file, never a truncated record. The object index and
// domain map are in-memory and rebuilt at startup, which is also the
// crash-recovery path.
type FS struct {
	dir string
	mu  sync.RWMutex

	objIndex   map[[32]byte]int64 // hash -> size
	totalBytes int64
	domains    map[string]string // domain -> slug (verified only)
}

// OpenFS loads (or creates) a store rooted at dir.
func OpenFS(dir string) (*FS, error) {
	for _, sub := range []string{"", "meta", "meta/sites", "meta/domains", "sites", "objects", "secrets"} {
		if err := os.MkdirAll(filepath.Join(dir, sub), 0o700); err != nil {
			return nil, err
		}
	}
	s := &FS{
		dir:      dir,
		objIndex: make(map[[32]byte]int64),
		domains:  make(map[string]string),
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *FS) load() error {
	// Rebuild the object index.
	objRoot := filepath.Join(s.dir, "objects")
	err := filepath.WalkDir(objRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		base := d.Name()
		if strings.HasPrefix(base, ".tmp-") {
			_ = os.Remove(path) // crash leftover
			return nil
		}
		var h [32]byte
		if _, err := hex.Decode(h[:], []byte(base)); err != nil {
			_ = os.Remove(path) // not an object name: drop
			return nil
		}
		fi, err := d.Info()
		if err != nil {
			return err
		}
		s.objIndex[h] = fi.Size()
		s.totalBytes += fi.Size()
		return nil
	})
	if err != nil {
		return err
	}
	// Rebuild the verified-domain map.
	domRoot := filepath.Join(s.dir, "meta", "domains")
	entries, err := os.ReadDir(domRoot)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		b, err := os.ReadFile(filepath.Join(domRoot, e.Name()))
		if err != nil {
			continue
		}
		var rec struct {
			Domain string `json:"domain"`
			Slug   string `json:"slug"`
		}
		if json.Unmarshal(b, &rec) == nil && rec.Domain != "" && rec.Slug != "" {
			s.domains[rec.Domain] = rec.Slug
		}
	}
	return nil
}

func writeJSONAtomic(dir, name string, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(tmp.Name()) }()
	if _, err := tmp.Write(b); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), filepath.Join(dir, name))
}

func readJSONFile(path string, v any) error {
	b, err := os.ReadFile(path) // #nosec G304 -- path built from validated slugs
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}

func (s *FS) sitePath(slug string) string {
	return filepath.Join(s.dir, "meta", "sites", slug+".json")
}

// GetSite returns the site or nil.
func (s *FS) GetSite(slug string) (*SiteMeta, error) {
	var m SiteMeta
	err := readJSONFile(s.sitePath(slug), &m)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// PutSite upserts a site record atomically.
func (s *FS) PutSite(m *SiteMeta) error {
	if m.Slug == "" {
		return errors.New("store: empty slug")
	}
	return writeJSONAtomic(filepath.Join(s.dir, "meta", "sites"), m.Slug+".json", m)
}

// DeleteSite removes the site record and all its deploy manifests.
func (s *FS) DeleteSite(slug string) error {
	_ = os.Remove(s.sitePath(slug))
	if err := os.RemoveAll(filepath.Join(s.dir, "sites", slug)); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for d, sl := range s.domains {
		if sl == slug {
			delete(s.domains, d)
		}
	}
	return nil
}

// ListSites returns every site record.
func (s *FS) ListSites() ([]*SiteMeta, error) {
	entries, err := os.ReadDir(filepath.Join(s.dir, "meta", "sites"))
	if err != nil {
		return nil, err
	}
	var out []*SiteMeta
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		var m SiteMeta
		if readJSONFile(filepath.Join(s.dir, "meta", "sites", e.Name()), &m) == nil {
			out = append(out, &m)
		}
	}
	return out, nil
}

func domainFile(domain string) string {
	return fmt.Sprintf("%x.json", sha256.Sum256([]byte(domain)))
}

// ResolveDomain maps a verified domain to its site slug.
func (s *FS) ResolveDomain(domain string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	slug, ok := s.domains[domain]
	return slug, ok
}

// SetDomain records a verified domain mapping.
func (s *FS) SetDomain(domain, slug string) error {
	s.mu.RLock()
	if cur, ok := s.domains[domain]; ok && cur != slug {
		s.mu.RUnlock()
		return ErrDomainUse
	}
	s.mu.RUnlock()
	rec := struct {
		Domain string `json:"domain"`
		Slug   string `json:"slug"`
	}{domain, slug}
	if err := writeJSONAtomic(filepath.Join(s.dir, "meta", "domains"), domainFile(domain), rec); err != nil {
		return err
	}
	s.mu.Lock()
	s.domains[domain] = slug
	s.mu.Unlock()
	return nil
}

// DeleteDomain removes a mapping.
func (s *FS) DeleteDomain(domain string) error {
	s.mu.Lock()
	delete(s.domains, domain)
	s.mu.Unlock()
	err := os.Remove(filepath.Join(s.dir, "meta", "domains", domainFile(domain)))
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func (s *FS) deployPath(slug, id string) string {
	return filepath.Join(s.dir, "sites", slug, "deploys", id+".json")
}

// PutDeploy writes an immutable deploy manifest.
func (s *FS) PutDeploy(d *Deploy) error {
	dir := filepath.Join(s.dir, "sites", d.Slug, "deploys")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	return writeJSONAtomic(dir, d.ID+".json", d)
}

// GetDeploy reads a manifest.
func (s *FS) GetDeploy(slug, id string) (*Deploy, error) {
	var d Deploy
	err := readJSONFile(s.deployPath(slug, id), &d)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// DeleteDeploy removes a manifest.
func (s *FS) DeleteDeploy(slug, id string) error {
	err := os.Remove(s.deployPath(slug, id))
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func (s *FS) objectPath(hash [32]byte) string {
	h := hex.EncodeToString(hash[:])
	return filepath.Join(s.dir, "objects", h[:2], h)
}

// PutObject stores data under its content hash, skipping duplicates.
func (s *FS) PutObject(hash [32]byte, data []byte) error {
	s.mu.RLock()
	_, known := s.objIndex[hash]
	s.mu.RUnlock()
	if known {
		if _, err := os.Stat(s.objectPath(hash)); err == nil {
			return nil // dedup hit
		}
	}
	path := s.objectPath(hash)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".tmp-*")
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(tmp.Name()) }()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return err
	}
	s.mu.Lock()
	if _, ok := s.objIndex[hash]; !ok {
		s.objIndex[hash] = int64(len(data))
		s.totalBytes += int64(len(data))
	}
	s.mu.Unlock()
	return nil
}

// OpenObject opens an object for streaming reads.
func (s *FS) OpenObject(hash [32]byte) (io.ReadSeekCloser, int64, error) {
	s.mu.RLock()
	size, ok := s.objIndex[hash]
	s.mu.RUnlock()
	if !ok {
		return nil, 0, ErrNotFound
	}
	f, err := os.Open(s.objectPath(hash))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, 0, ErrNotFound
		}
		return nil, 0, err
	}
	return f, size, nil
}

// DeleteObject removes an object.
func (s *FS) DeleteObject(hash [32]byte) error {
	s.mu.Lock()
	size, ok := s.objIndex[hash]
	if ok {
		delete(s.objIndex, hash)
		s.totalBytes -= size
	}
	s.mu.Unlock()
	err := os.Remove(s.objectPath(hash))
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// ListObjects returns the object index.
func (s *FS) ListObjects() (map[[32]byte]int64, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[[32]byte]int64, len(s.objIndex))
	for h, sz := range s.objIndex {
		out[h] = sz
	}
	return out, nil
}

// LoadSecret reads a node-shared secret (hex-encoded on disk).
func (s *FS) LoadSecret(name string) ([]byte, error) {
	b, err := os.ReadFile(filepath.Join(s.dir, "secrets", name))
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return hex.DecodeString(string(bytes.TrimSpace(b)))
}

// SaveSecret persists a node-shared secret.
func (s *FS) SaveSecret(name string, b []byte) error {
	dir := filepath.Join(s.dir, "secrets")
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	defer func() { _ = os.Remove(tmp.Name()) }()
	if _, err := tmp.WriteString(hex.EncodeToString(b)); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), filepath.Join(dir, name))
}

// Refresh reloads the domain map from disk. Object index and site records
// are read live, so only domains need a rescan for shared-volume HA.
func (s *FS) Refresh() error {
	domRoot := filepath.Join(s.dir, "meta", "domains")
	entries, err := os.ReadDir(domRoot)
	if err != nil {
		return err
	}
	fresh := make(map[string]string)
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		b, err := os.ReadFile(filepath.Join(domRoot, e.Name()))
		if err != nil {
			continue
		}
		var rec struct {
			Domain string `json:"domain"`
			Slug   string `json:"slug"`
		}
		if json.Unmarshal(b, &rec) == nil && rec.Domain != "" && rec.Slug != "" {
			fresh[rec.Domain] = rec.Slug
		}
	}
	s.mu.Lock()
	s.domains = fresh
	s.mu.Unlock()
	return nil
}

// TotalBytes returns stored object bytes.
func (s *FS) TotalBytes() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.totalBytes
}

// Close releases resources. The filesystem store holds none.
func (s *FS) Close() error { return nil }
