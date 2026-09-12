package store

import (
	"crypto/sha256"
	"io"
	"testing"

	"github.com/Sudo-Ivan/tactile/publish/internal/identity"
)

func testFS(t *testing.T) *FS {
	t.Helper()
	s, err := OpenFS(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

var testOwner identity.PubKey

func TestSiteCRUD(t *testing.T) {
	s := testFS(t)
	m := &SiteMeta{Slug: "blog", Owner: testOwner, Title: "Blog"}
	if err := s.PutSite(m); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetSite("blog")
	if err != nil || got == nil || got.Title != "Blog" {
		t.Fatalf("get: %v %+v", err, got)
	}
	m.Title = "Renamed"
	if err := s.PutSite(m); err != nil {
		t.Fatal(err)
	}
	got, _ = s.GetSite("blog")
	if got.Title != "Renamed" {
		t.Fatal("update failed")
	}
	if err := s.DeleteSite("blog"); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.GetSite("blog"); got != nil {
		t.Fatal("site still there")
	}
}

func TestObjectsDedup(t *testing.T) {
	s := testFS(t)
	data := []byte("hello object")
	h := sha256.Sum256(data)
	if err := s.PutObject(h, data); err != nil {
		t.Fatal(err)
	}
	if err := s.PutObject(h, data); err != nil { // dup: no error, no growth
		t.Fatal(err)
	}
	if s.TotalBytes() != int64(len(data)) {
		t.Fatalf("dedup failed: %d", s.TotalBytes())
	}
	rc, size, err := s.OpenObject(h)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = rc.Close() }()
	got, _ := io.ReadAll(rc)
	if string(got) != string(data) || size != int64(len(data)) {
		t.Fatal("object mismatch")
	}
	if err := s.DeleteObject(h); err != nil {
		t.Fatal(err)
	}
	if s.TotalBytes() != 0 {
		t.Fatal("delete did not reclaim")
	}
}

func TestDeploysAndDomains(t *testing.T) {
	s := testFS(t)
	d := &Deploy{ID: "d1", Slug: "blog", Created: 1}
	if err := s.PutDeploy(d); err != nil {
		t.Fatal(err)
	}
	if got, err := s.GetDeploy("blog", "d1"); err != nil || got.ID != "d1" {
		t.Fatalf("get deploy: %v", err)
	}
	if _, err := s.GetDeploy("blog", "nope"); err != ErrNotFound {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
	if err := s.SetDomain("example.com", "blog"); err != nil {
		t.Fatal(err)
	}
	if slug, ok := s.ResolveDomain("example.com"); !ok || slug != "blog" {
		t.Fatal("resolve failed")
	}
	if err := s.SetDomain("example.com", "other"); err != ErrDomainUse {
		t.Fatalf("want ErrDomainUse, got %v", err)
	}
	if err := s.DeleteDomain("example.com"); err != nil {
		t.Fatal(err)
	}
	if _, ok := s.ResolveDomain("example.com"); ok {
		t.Fatal("domain still mapped")
	}
}

func TestSecretRoundTrip(t *testing.T) {
	s := testFS(t)
	if b, err := s.LoadSecret("node.key"); err != nil || b != nil {
		t.Fatalf("want nil, got %v %x", err, b)
	}
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	if err := s.SaveSecret("node.key", key); err != nil {
		t.Fatal(err)
	}
	got, err := s.LoadSecret("node.key")
	if err != nil || len(got) != 32 || got[31] != 31 {
		t.Fatalf("secret round trip: %v len=%d", err, len(got))
	}
}

func TestRefreshPicksUpPeerDomain(t *testing.T) {
	dir := t.TempDir()
	a, err := OpenFS(dir)
	if err != nil {
		t.Fatal(err)
	}
	b, err := OpenFS(dir) // second "node" on shared volume
	if err != nil {
		t.Fatal(err)
	}
	if err := a.SetDomain("peer.example", "s1"); err != nil {
		t.Fatal(err)
	}
	if _, ok := b.ResolveDomain("peer.example"); ok {
		t.Fatal("domain visible before refresh")
	}
	if err := b.Refresh(); err != nil {
		t.Fatal(err)
	}
	if slug, ok := b.ResolveDomain("peer.example"); !ok || slug != "s1" {
		t.Fatal("domain not visible after refresh")
	}
}
