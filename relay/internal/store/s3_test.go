package store

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Sudo-Ivan/tactile/relay/internal/blob"
	"github.com/Sudo-Ivan/tactile/relay/internal/s3client"
)

// mockS3 is an in-memory S3-compatible endpoint for tests: path-style
// addressing, Put/Get/Delete and ListObjectsV2 with real Range support.
type mockS3 struct {
	mu   sync.Mutex
	objs map[string][]byte
	ts   *httptest.Server
}

func newMockS3(t *testing.T) *mockS3 {
	t.Helper()
	m := &mockS3{objs: make(map[string][]byte)}
	m.ts = httptest.NewServer(http.HandlerFunc(m.serve))
	t.Cleanup(m.ts.Close)
	return m
}

func (m *mockS3) serve(w http.ResponseWriter, r *http.Request) {
	m.mu.Lock()
	defer m.mu.Unlock()
	// List: GET /bucket?list-type=2&prefix=...
	if r.Method == http.MethodGet && r.URL.Query().Get("list-type") == "2" {
		prefix := r.URL.Query().Get("prefix")
		var keys []string
		for k := range m.objs {
			if strings.HasPrefix(k, prefix) {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)
		var b strings.Builder
		b.WriteString(`<ListBucketResult><IsTruncated>false</IsTruncated>`)
		for _, k := range keys {
			fmt.Fprintf(&b, "<Contents><Key>%s</Key><Size>%d</Size></Contents>", k, len(m.objs[k]))
		}
		b.WriteString(`</ListBucketResult>`)
		w.Write([]byte(b.String()))
		return
	}
	// Path-style: /bucket/key
	key := strings.TrimPrefix(r.URL.Path, "/")
	if i := strings.IndexByte(key, '/'); i >= 0 {
		key = key[i+1:] // strip bucket
	}
	switch r.Method {
	case http.MethodPut:
		body, _ := io.ReadAll(r.Body)
		m.objs[key] = body
		w.WriteHeader(http.StatusOK)
	case http.MethodGet:
		body, ok := m.objs[key]
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if rng := r.Header.Get("Range"); rng != "" {
			var a, b int64
			if _, err := fmt.Sscanf(strings.TrimPrefix(rng, "bytes="), "%d-%d", &a, &b); err == nil {
				if a < 0 || a >= int64(len(body)) || b < a {
					w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
					return
				}
				if b >= int64(len(body)) {
					b = int64(len(body)) - 1
				}
				w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", a, b, len(body)))
				w.WriteHeader(http.StatusPartialContent)
				w.Write(body[a : b+1])
				return
			}
		}
		w.Header().Set("Content-Length", strconv.Itoa(len(body)))
		w.WriteHeader(http.StatusOK)
		w.Write(body)
	case http.MethodDelete:
		delete(m.objs, key)
		w.WriteHeader(http.StatusNoContent)
	}
}

func newS3Backend(t *testing.T, m *mockS3) *S3 {
	t.Helper()
	cli := s3client.New(s3client.Config{
		Endpoint:  m.ts.URL,
		Region:    "auto",
		Bucket:    "test",
		AccessKey: "ak",
		SecretKey: "sk",
		PathStyle: true,
	})
	s, err := NewS3(cli, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestS3Backend(t *testing.T) {
	m := newMockS3(t)
	s := newS3Backend(t, m)
	rec, pub := testRecord(t, 3600)
	now := time.Now().Unix()

	if err := s.PutWithin(rec, 1<<30, 1<<30); err != nil {
		t.Fatal(err)
	}
	got, err := s.Get(pub, rec.ID, now)
	if err != nil {
		t.Fatal(err)
	}
	if string(got.Payload) != string(rec.Payload) {
		t.Fatal("payload mismatch")
	}
	if !got.Verify(3600) {
		t.Fatal("stored record fails verify")
	}
	items := s.List(pub, now)
	if len(items) != 1 {
		t.Fatal("list mismatch")
	}
	if err := s.Delete(pub, rec.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(pub, rec.ID, now); !isNotFound(err) {
		t.Fatalf("get after delete: %v", err)
	}
}

func TestS3Range(t *testing.T) {
	m := newMockS3(t)
	s := newS3Backend(t, m)
	rec, pub := testRecord(t, 3600)
	now := time.Now().Unix()
	if err := s.Put(rec); err != nil {
		t.Fatal(err)
	}
	part, total, err := s.GetRange(pub, rec.ID, 3, 8, now)
	if err != nil {
		t.Fatal(err)
	}
	if total != int64(len(rec.Payload)) {
		t.Fatalf("total %d want %d", total, len(rec.Payload))
	}
	if string(part) != string(rec.Payload[3:8]) {
		t.Fatalf("range %q want %q", part, rec.Payload[3:8])
	}
}

func TestS3IndexRebuild(t *testing.T) {
	m := newMockS3(t)
	s := newS3Backend(t, m)
	rec, pub := testRecord(t, 3600)
	if err := s.Put(rec); err != nil {
		t.Fatal(err)
	}
	// New backend instance over the same bucket rebuilds the index.
	s2 := newS3Backend(t, m)
	if got := s2.Usage(pub).Count; got != 1 {
		t.Fatalf("rebuilt usage %d", got)
	}
	got, err := s2.Get(pub, rec.ID, time.Now().Unix())
	if err != nil {
		t.Fatal(err)
	}
	if string(got.Payload) != string(rec.Payload) {
		t.Fatal("payload mismatch after rebuild")
	}
}

func TestS3SweepAndQuota(t *testing.T) {
	m := newMockS3(t)
	s := newS3Backend(t, m)
	rec, pub := testRecord(t, 1) // expires almost immediately
	if err := s.Put(rec); err != nil {
		t.Fatal(err)
	}
	if n := s.Sweep(time.Now().Unix() + 10); n != 1 {
		t.Fatalf("sweep %d", n)
	}
	if len(m.objs) != 0 {
		t.Fatal("expired object left in bucket")
	}

	rec2, _ := testRecord(t, 3600)
	rec2.Identity = pub
	if err := s.PutWithin(rec2, 1, 1<<30); !errors.Is(err, ErrQuotaExceeded) {
		t.Fatalf("quota: %v", err)
	}
}

func isNotFound(err error) bool {
	return errors.Is(err, blob.ErrNotFound)
}
