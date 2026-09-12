// Package store persists encrypted blobs and tracks usage for quota
// enforcement. Two backends ship in-tree: a filesystem store and an
// S3-compatible object store, both keyed by identity hash.
package store

import (
	"errors"
	"time"

	"github.com/Sudo-Ivan/tactile/relay/internal/blob"
	"github.com/Sudo-Ivan/tactile/relay/internal/identity"
)

// Usage reports stored bytes and blob count.
type Usage struct {
	Bytes int64
	Count int
}

// Meta is listing information for one blob.
type Meta struct {
	ID        [32]byte
	Size      int64 // payload bytes, excluding the on-disk header
	ExpiresAt int64
	Sig       identity.Sig
}

// Quota and capacity errors returned by PutWithin.
var (
	ErrQuotaExceeded = errors.New("store: identity quota exceeded")
	ErrStorageFull   = errors.New("store: storage full")
)

// Backend is the storage contract the server depends on. Implementations
// must be safe for concurrent use and must serialize the quota check with
// the write in PutWithin.
type Backend interface {
	// PutWithin stores a record only if it fits the caps.
	PutWithin(r *blob.Record, identityCap, totalCap int64) error
	// Get returns a live record; expired records report blob.ErrExpired.
	Get(pub identity.PubKey, bid [32]byte, now int64) (*blob.Record, error)
	// GetRange returns payload bytes [start, end) and the total payload
	// length. Callers bound end to total.
	GetRange(pub identity.PubKey, bid [32]byte, start, end int64, now int64) (payload []byte, total int64, err error)
	// List returns live metadata for an identity, sorted by id.
	List(pub identity.PubKey, now int64) []Meta
	// Delete removes a blob; absent ids report blob.ErrNotFound.
	Delete(pub identity.PubKey, bid [32]byte) error
	// UsageID returns per-identity usage by identity ID.
	UsageID(id identity.ID) Usage
	// Usage returns per-identity usage by public key.
	Usage(pub identity.PubKey) Usage
	// TotalBytes returns bytes stored across all identities.
	TotalBytes() int64
	// Sweep removes expired blobs and returns the count removed.
	Sweep(now int64) int
	// Sweeper runs Sweep on an interval until stop closes.
	Sweeper(interval time.Duration, stop <-chan struct{})
	// Close releases resources.
	Close() error
}
