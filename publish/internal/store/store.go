// Package store is the publish node's persistence layer. Sites are owned
// by Ed25519 identities; each deploy is an immutable manifest pointing at
// content-addressed objects, and the site's current pointer flips
// atomically, which gives dedup, instant rollback and cheap quota
// accounting for free.
//
// Two backends exist: fs for single-node (or shared-volume) operation and
// s3 for HA, where any number of stateless nodes share one bucket.
package store

import (
	"errors"
	"io"

	"github.com/Sudo-Ivan/tactile/publish/internal/bundle"
	"github.com/Sudo-Ivan/tactile/publish/internal/identity"
)

// Errors returned by backends.
var (
	ErrNotFound  = errors.New("store: not found")
	ErrExists    = errors.New("store: exists")
	ErrCorrupt   = errors.New("store: corrupt record")
	ErrDomainUse = errors.New("store: domain already mapped")
)

// FileEntry is one file inside a deploy manifest.
type FileEntry struct {
	Path string `json:"path"` // normalized, leading slash
	Hash string `json:"hash"` // hex sha256
	Size int64  `json:"size"`
	MIME string `json:"mime"`
}

// Deploy is an immutable site snapshot.
type Deploy struct {
	ID      string         `json:"id"`
	Slug    string         `json:"slug"`
	Created int64          `json:"created"`
	Bytes   int64          `json:"bytes"` // sum of file sizes
	Files   []FileEntry    `json:"files"`
	Options bundle.Options `json:"options"`
}

// Hash decodes a FileEntry hash.
func (f FileEntry) HashBytes() ([32]byte, error) {
	var h [32]byte
	if len(f.Hash) != 64 {
		return h, ErrCorrupt
	}
	for i := range h {
		var v byte
		for _, c := range f.Hash[2*i : 2*i+2] {
			v <<= 4
			switch {
			case c >= '0' && c <= '9':
				v |= byte(c - '0')
			case c >= 'a' && c <= 'f':
				v |= byte(c-'a') + 10
			default:
				return h, ErrCorrupt
			}
		}
		h[i] = v
	}
	return h, nil
}

// DomainEntry is a custom domain attached to a site.
type DomainEntry struct {
	Name     string `json:"name"`
	Verified bool   `json:"verified"`
}

// SiteMeta is everything the node knows about one claimed slug.
type SiteMeta struct {
	Slug    string          `json:"slug"`
	Owner   identity.PubKey `json:"owner"`
	Title   string          `json:"title"`
	Created int64           `json:"created"`
	Updated int64           `json:"updated"`
	Current string          `json:"current"` // active deploy id
	Deploys []string        `json:"deploys"` // retained deploy ids, chronological
	Domains []DomainEntry   `json:"domains,omitempty"`
}

// Domain returns the entry for name or false.
func (m *SiteMeta) Domain(name string) (DomainEntry, bool) {
	for _, d := range m.Domains {
		if d.Name == name {
			return d, true
		}
	}
	return DomainEntry{}, false
}

// VerifiedDomains counts verified custom domains.
func (m *SiteMeta) VerifiedDomains() int {
	var n int
	for _, d := range m.Domains {
		if d.Verified {
			n++
		}
	}
	return n
}

// Usage is per-identity accounting, deduplicated across all retained
// deploys of all the identity's sites (objects are content-addressed).
type Usage struct {
	Bytes int64 `json:"bytes"`
	Sites int   `json:"sites"`
	Files int   `json:"files"`
}

// Backend is the storage contract. Implementations must be safe for
// concurrent use; cross-node safety comes from atomic single-object writes
// (rename on fs, put on s3) plus immutable manifests.
type Backend interface {
	// Sites.
	GetSite(slug string) (*SiteMeta, error) // nil, nil when absent
	PutSite(m *SiteMeta) error              // full upsert, atomic
	DeleteSite(slug string) error
	ListSites() ([]*SiteMeta, error)

	// Verified custom-domain map: domain -> slug.
	ResolveDomain(domain string) (string, bool)
	SetDomain(domain, slug string) error
	DeleteDomain(domain string) error

	// Immutable deploy manifests.
	PutDeploy(d *Deploy) error
	GetDeploy(slug, id string) (*Deploy, error)
	DeleteDeploy(slug, id string) error

	// Content-addressed objects.
	PutObject(hash [32]byte, data []byte) error // dedups by hash
	OpenObject(hash [32]byte) (io.ReadSeekCloser, int64, error)
	DeleteObject(hash [32]byte) error
	ListObjects() (map[[32]byte]int64, error)

	// LoadSecret/SaveSecret store small node-shared secrets (PoW key,
	// domain-verify key) inside the backend so every node in an HA set
	// derives identical tokens.
	LoadSecret(name string) ([]byte, error)
	SaveSecret(name string, b []byte) error

	TotalBytes() int64

	// Refresh reloads eventually-consistent indexes (site set, domain
	// map) from the backend. fs reloads from disk; s3 relists the bucket.
	// HA nodes call this periodically so peer writes become visible.
	Refresh() error

	Close() error
}
