package store

import (
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"testing"
	"time"

	"github.com/Sudo-Ivan/tactile/relay/internal/blob"
	"github.com/Sudo-Ivan/tactile/relay/internal/identity"
)

func testStore(t *testing.T) *FS {
	t.Helper()
	s, err := OpenFS(t.TempDir(), 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func testRecord(t *testing.T, ttl int64) (*blob.Record, identity.PubKey) {
	t.Helper()
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	var pk identity.PubKey
	copy(pk[:], pub)
	var id [32]byte
	rand.Read(id[:])
	payload := []byte("encrypted payload")
	sig := ed25519.Sign(priv, blob.SigMessage(id, ttl, payload))
	rec := &blob.Record{
		ID: id, Identity: pk, Payload: payload,
		ExpiresAt: time.Now().Unix() + ttl,
	}
	copy(rec.Sig[:], sig)
	return rec, pk
}

func TestPutGetListDelete(t *testing.T) {
	s := testStore(t)
	rec, pub := testRecord(t, 3600)
	now := time.Now().Unix()

	if err := s.Put(rec); err != nil {
		t.Fatal(err)
	}
	got, err := s.Get(pub, rec.ID, now)
	if err != nil {
		t.Fatal(err)
	}
	if string(got.Payload) != string(rec.Payload) {
		t.Fatal("payload mismatch")
	}
	items := s.List(pub, now)
	if len(items) != 1 || items[0].ID != rec.ID {
		t.Fatal("list mismatch")
	}
	if err := s.Delete(pub, rec.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(pub, rec.ID, now); !errors.Is(err, blob.ErrNotFound) {
		t.Fatalf("get after delete: %v", err)
	}
}

func TestDuplicateRejected(t *testing.T) {
	s := testStore(t)
	rec, _ := testRecord(t, 3600)
	if err := s.Put(rec); err != nil {
		t.Fatal(err)
	}
	if err := s.Put(rec); !errors.Is(err, blob.ErrExists) {
		t.Fatalf("dup put: %v", err)
	}
}

func TestExpiry(t *testing.T) {
	s := testStore(t)
	rec, pub := testRecord(t, 10) // expires 10s from now
	if err := s.Put(rec); err != nil {
		t.Fatal(err)
	}
	future := time.Now().Unix() + 20
	if _, err := s.Get(pub, rec.ID, future); !errors.Is(err, blob.ErrExpired) {
		t.Fatalf("expired get: %v", err)
	}
	if n := s.Sweep(future); n != 0 {
		// Lazy delete already removed it.
		t.Fatalf("sweep removed %d, expected 0", n)
	}

	rec2, pub2 := testRecord(t, 10)
	if err := s.Put(rec2); err != nil {
		t.Fatal(err)
	}
	if n := s.Sweep(future); n != 1 {
		t.Fatalf("sweep removed %d, expected 1", n)
	}
	if got := s.List(pub2, future); len(got) != 0 {
		t.Fatal("expired blob listed")
	}
}

func TestUsageAndQuota(t *testing.T) {
	s := testStore(t)
	rec, pub := testRecord(t, 3600)
	if err := s.PutWithin(rec, rec.Size(), rec.Size()); err != nil {
		t.Fatal(err)
	}
	u := s.Usage(pub)
	if u.Count != 1 || u.Bytes != rec.Size() {
		t.Fatalf("usage %+v", u)
	}
	if s.TotalBytes() != rec.Size() {
		t.Fatal("total bytes mismatch")
	}

	// Identity quota.
	rec2, _ := testRecord(t, 3600)
	rec2.Identity = pub // same owner
	if err := s.PutWithin(rec2, rec.Size(), 1<<30); !errors.Is(err, ErrQuotaExceeded) {
		t.Fatalf("quota: %v", err)
	}
	// Global cap.
	rec3, _ := testRecord(t, 3600)
	if err := s.PutWithin(rec3, 1<<30, s.TotalBytes()+rec3.Size()-1); !errors.Is(err, ErrStorageFull) {
		t.Fatalf("storage full: %v", err)
	}
}

func TestIsolation(t *testing.T) {
	s := testStore(t)
	rec, _ := testRecord(t, 3600)
	_, pubB := testRecord(t, 3600)
	if err := s.Put(rec); err != nil {
		t.Fatal(err)
	}
	// Another identity cannot see or delete it.
	if _, err := s.Get(pubB, rec.ID, time.Now().Unix()); !errors.Is(err, blob.ErrNotFound) {
		t.Fatalf("cross-identity get: %v", err)
	}
	if err := s.Delete(pubB, rec.ID); !errors.Is(err, blob.ErrNotFound) {
		t.Fatalf("cross-identity delete: %v", err)
	}
}

func TestPersistence(t *testing.T) {
	dir := t.TempDir()
	s, _ := OpenFS(dir, 1<<20)
	rec, pub := testRecord(t, 3600)
	if err := s.Put(rec); err != nil {
		t.Fatal(err)
	}
	// Reopen: index must rebuild from disk.
	s2, err := OpenFS(dir, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	got, err := s2.Get(pub, rec.ID, time.Now().Unix())
	if err != nil {
		t.Fatal(err)
	}
	if string(got.Payload) != string(rec.Payload) {
		t.Fatal("payload mismatch after reload")
	}
	if s2.Usage(pub).Count != 1 {
		t.Fatal("usage lost after reload")
	}
}

func TestConcurrentAccess(t *testing.T) {
	s := testStore(t)
	done := make(chan struct{})
	for i := 0; i < 8; i++ {
		go func() {
			defer func() { done <- struct{}{} }()
			for j := 0; j < 50; j++ {
				rec, pub := testRecord(t, 3600)
				if s.Put(rec) == nil {
					s.Get(pub, rec.ID, time.Now().Unix())
					s.List(pub, time.Now().Unix())
					s.Delete(pub, rec.ID)
				}
			}
		}()
	}
	for i := 0; i < 8; i++ {
		<-done
	}
	if s.TotalBytes() != 0 {
		t.Fatalf("leaked %d bytes", s.TotalBytes())
	}
}
