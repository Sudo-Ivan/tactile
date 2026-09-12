package store

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/Sudo-Ivan/tactile/publish/internal/s3client"
)

// S3 is the S3-compatible Backend. Object keys mirror the fs layout:
//
//	meta/sites/<slug>.json
//	meta/domains/<sha256(domain)>.json
//	sites/<slug>/deploys/<id>.json
//	objects/<sha256>
//	secrets/<name>
//
// Site metadata and the domain map are cached in memory and refreshed from
// the bucket at startup; objects are immutable so they never go stale. With
// a shared bucket any number of stateless nodes serve the same sites,
// which is the HA deployment mode. An optional local cacheDir keeps hot
// objects on disk so steady-state reads do not hit S3.
type S3 struct {
	cli      *s3client.Client
	cacheDir string
	mu       sync.RWMutex

	objIndex   map[[32]byte]int64
	totalBytes int64
	domains    map[string]string
	sites      map[string]struct{} // slugs present, for ListSites
}

// NewS3 builds the backend and rebuilds indexes by listing the bucket.
func NewS3(cli *s3client.Client, cacheDir string) (*S3, error) {
	s := &S3{
		cli:      cli,
		cacheDir: cacheDir,
		objIndex: make(map[[32]byte]int64),
		domains:  make(map[string]string),
		sites:    make(map[string]struct{}),
	}
	if cacheDir != "" {
		if err := os.MkdirAll(cacheDir, 0o700); err != nil {
			return nil, err
		}
	}
	if err := s.load(context.Background()); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *S3) load(ctx context.Context) error {
	objs, err := s.cli.ListObjects(ctx, "objects/")
	if err != nil {
		return err
	}
	for _, o := range objs {
		name := strings.TrimPrefix(o.Key, "objects/")
		var h [32]byte
		if _, err := hex.Decode(h[:], []byte(name)); err != nil {
			continue
		}
		s.objIndex[h] = o.Size
		s.totalBytes += o.Size
	}
	doms, err := s.cli.ListObjects(ctx, "meta/domains/")
	if err != nil {
		return err
	}
	for _, o := range doms {
		body, _, notFound, err := s.cli.GetObject(ctx, o.Key, "")
		if err != nil || notFound {
			continue
		}
		var rec struct {
			Domain string `json:"domain"`
			Slug   string `json:"slug"`
		}
		if json.Unmarshal(body, &rec) == nil && rec.Domain != "" && rec.Slug != "" {
			s.domains[rec.Domain] = rec.Slug
		}
	}
	slugs, err := s.cli.ListObjects(ctx, "meta/sites/")
	if err != nil {
		return err
	}
	for _, o := range slugs {
		name := strings.TrimSuffix(strings.TrimPrefix(o.Key, "meta/sites/"), ".json")
		if name != "" {
			s.sites[name] = struct{}{}
		}
	}
	return nil
}

func siteKey(slug string) string { return "meta/sites/" + slug + ".json" }
func deployKey(slug, id string) string {
	return "sites/" + slug + "/deploys/" + id + ".json"
}
func objectKey(h [32]byte) string { return "objects/" + hex.EncodeToString(h[:]) }
func secretKey(name string) string {
	return "secrets/" + name
}

func s3DomainKey(domain string) string {
	return "meta/domains/" + domainFile(domain)
}

// GetSite returns the site or nil.
func (s *S3) GetSite(slug string) (*SiteMeta, error) {
	body, _, notFound, err := s.cli.GetObject(context.Background(), siteKey(slug), "")
	if err != nil {
		return nil, err
	}
	if notFound {
		return nil, nil
	}
	var m SiteMeta
	if err := json.Unmarshal(body, &m); err != nil {
		return nil, fmt.Errorf("%w: site %s", ErrCorrupt, slug)
	}
	return &m, nil
}

// PutSite upserts a site record.
func (s *S3) PutSite(m *SiteMeta) error {
	if m.Slug == "" {
		return errors.New("store: empty slug")
	}
	b, err := json.Marshal(m)
	if err != nil {
		return err
	}
	if err := s.cli.PutObject(context.Background(), siteKey(m.Slug), b, nil); err != nil {
		return err
	}
	s.mu.Lock()
	s.sites[m.Slug] = struct{}{}
	s.mu.Unlock()
	return nil
}

// DeleteSite removes the site record, its deploys and domain mappings.
func (s *S3) DeleteSite(slug string) error {
	m, err := s.GetSite(slug)
	if err != nil {
		return err
	}
	if m != nil {
		for _, id := range m.Deploys {
			_ = s.cli.DeleteObject(context.Background(), deployKey(slug, id))
		}
		s.mu.Lock()
		for d, sl := range s.domains {
			if sl == slug {
				delete(s.domains, d)
				_ = s.cli.DeleteObject(context.Background(), s3DomainKey(d))
			}
		}
		delete(s.sites, slug)
		s.mu.Unlock()
	}
	return s.cli.DeleteObject(context.Background(), siteKey(slug))
}

// ListSites returns every site record known to the index. A site created
// on a peer node since startup may be missing until reload; HA nodes treat
// this list as eventually consistent (sweeps and usage only).
func (s *S3) ListSites() ([]*SiteMeta, error) {
	s.mu.RLock()
	slugs := make([]string, 0, len(s.sites))
	for slug := range s.sites {
		slugs = append(slugs, slug)
	}
	s.mu.RUnlock()
	var out []*SiteMeta
	for _, slug := range slugs {
		m, err := s.GetSite(slug)
		if err != nil {
			return nil, err
		}
		if m != nil {
			out = append(out, m)
		}
	}
	return out, nil
}

// ResolveDomain maps a verified domain to its site slug.
func (s *S3) ResolveDomain(domain string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	slug, ok := s.domains[domain]
	return slug, ok
}

// SetDomain records a verified domain mapping.
func (s *S3) SetDomain(domain, slug string) error {
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
	b, _ := json.Marshal(rec)
	if err := s.cli.PutObject(context.Background(), s3DomainKey(domain), b, nil); err != nil {
		return err
	}
	s.mu.Lock()
	s.domains[domain] = slug
	s.mu.Unlock()
	return nil
}

// DeleteDomain removes a mapping.
func (s *S3) DeleteDomain(domain string) error {
	s.mu.Lock()
	delete(s.domains, domain)
	s.mu.Unlock()
	return s.cli.DeleteObject(context.Background(), s3DomainKey(domain))
}

// PutDeploy writes an immutable deploy manifest.
func (s *S3) PutDeploy(d *Deploy) error {
	b, err := json.Marshal(d)
	if err != nil {
		return err
	}
	return s.cli.PutObject(context.Background(), deployKey(d.Slug, d.ID), b, nil)
}

// GetDeploy reads a manifest.
func (s *S3) GetDeploy(slug, id string) (*Deploy, error) {
	body, _, notFound, err := s.cli.GetObject(context.Background(), deployKey(slug, id), "")
	if err != nil {
		return nil, err
	}
	if notFound {
		return nil, ErrNotFound
	}
	var d Deploy
	if err := json.Unmarshal(body, &d); err != nil {
		return nil, fmt.Errorf("%w: deploy %s/%s", ErrCorrupt, slug, id)
	}
	return &d, nil
}

// DeleteDeploy removes a manifest.
func (s *S3) DeleteDeploy(slug, id string) error {
	return s.cli.DeleteObject(context.Background(), deployKey(slug, id))
}

// PutObject stores data under its content hash, skipping duplicates.
func (s *S3) PutObject(hash [32]byte, data []byte) error {
	s.mu.RLock()
	_, known := s.objIndex[hash]
	s.mu.RUnlock()
	if known {
		return nil // dedup hit
	}
	if err := s.cli.PutObject(context.Background(), objectKey(hash), data, nil); err != nil {
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

// OpenObject returns an object reader. With a cache dir the object is
// served from (or written through to) local disk; otherwise it is fetched
// from S3 into memory. Objects are immutable so cache entries never
// expire.
func (s *S3) OpenObject(hash [32]byte) (io.ReadSeekCloser, int64, error) {
	s.mu.RLock()
	size, ok := s.objIndex[hash]
	s.mu.RUnlock()
	if !ok {
		return nil, 0, ErrNotFound
	}
	if s.cacheDir != "" {
		p := filepath.Join(s.cacheDir, hex.EncodeToString(hash[:]))
		if f, err := os.Open(p); err == nil {
			return f, size, nil
		}
	}
	body, _, notFound, err := s.cli.GetObject(context.Background(), objectKey(hash), "")
	if err != nil {
		return nil, 0, err
	}
	if notFound {
		return nil, 0, ErrNotFound
	}
	if s.cacheDir != "" {
		if tmp, err := os.CreateTemp(s.cacheDir, ".tmp-*"); err == nil {
			if _, werr := tmp.Write(body); werr == nil {
				_ = tmp.Close()
				_ = os.Rename(tmp.Name(), filepath.Join(s.cacheDir, hex.EncodeToString(hash[:])))
			} else {
				_ = tmp.Close()
				_ = os.Remove(tmp.Name())
			}
		}
	}
	return readSeekCloser{bytes.NewReader(body)}, size, nil
}

// DeleteObject removes an object from S3 and any local cache copy.
func (s *S3) DeleteObject(hash [32]byte) error {
	s.mu.Lock()
	size, ok := s.objIndex[hash]
	if ok {
		delete(s.objIndex, hash)
		s.totalBytes -= size
	}
	s.mu.Unlock()
	if s.cacheDir != "" {
		_ = os.Remove(filepath.Join(s.cacheDir, hex.EncodeToString(hash[:])))
	}
	return s.cli.DeleteObject(context.Background(), objectKey(hash))
}

// ListObjects returns the object index.
func (s *S3) ListObjects() (map[[32]byte]int64, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[[32]byte]int64, len(s.objIndex))
	for h, sz := range s.objIndex {
		out[h] = sz
	}
	return out, nil
}

// LoadSecret reads a node-shared secret from the bucket.
func (s *S3) LoadSecret(name string) ([]byte, error) {
	body, _, notFound, err := s.cli.GetObject(context.Background(), secretKey(name), "")
	if err != nil {
		return nil, err
	}
	if notFound {
		return nil, nil
	}
	return hex.DecodeString(strings.TrimSpace(string(body)))
}

// SaveSecret persists a node-shared secret to the bucket.
func (s *S3) SaveSecret(name string, b []byte) error {
	return s.cli.PutObject(context.Background(), secretKey(name), []byte(hex.EncodeToString(b)), nil)
}

// Refresh relists the site set and domain map so sites and domains
// written by peer nodes become visible to this node.
func (s *S3) Refresh() error {
	ctx := context.Background()
	doms, err := s.cli.ListObjects(ctx, "meta/domains/")
	if err != nil {
		return err
	}
	fresh := make(map[string]string)
	for _, o := range doms {
		body, _, notFound, err := s.cli.GetObject(ctx, o.Key, "")
		if err != nil || notFound {
			continue
		}
		var rec struct {
			Domain string `json:"domain"`
			Slug   string `json:"slug"`
		}
		if json.Unmarshal(body, &rec) == nil && rec.Domain != "" && rec.Slug != "" {
			fresh[rec.Domain] = rec.Slug
		}
	}
	slugs, err := s.cli.ListObjects(ctx, "meta/sites/")
	if err != nil {
		return err
	}
	freshSites := make(map[string]struct{})
	for _, o := range slugs {
		name := strings.TrimSuffix(strings.TrimPrefix(o.Key, "meta/sites/"), ".json")
		if name != "" {
			freshSites[name] = struct{}{}
		}
	}
	s.mu.Lock()
	s.domains = fresh
	s.sites = freshSites
	s.mu.Unlock()
	return nil
}

// TotalBytes returns stored object bytes known to this node.
func (s *S3) TotalBytes() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.totalBytes
}

// Close releases resources. The S3 backend holds none.
func (s *S3) Close() error { return nil }

type readSeekCloser struct{ *bytes.Reader }

func (readSeekCloser) Close() error { return nil }
