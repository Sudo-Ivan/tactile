package store

import (
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/Sudo-Ivan/tactile/relay/internal/blob"
	"github.com/Sudo-Ivan/tactile/relay/internal/identity"
)

// modelKey identifies a blob in the oracle model.
type modelKey struct {
	owner identity.ID
	id    [32]byte
}

// TestStoreOracle runs a random op sequence against the store and a plain
// map model, and asserts they agree after every step. Any drift means the
// store has a bookkeeping bug the unit tests missed.
func TestStoreOracle(t *testing.T) {
	s := testStore(t)
	model := make(map[modelKey]*blob.Record)

	// A small fixed set of identities and ids creates collisions often.
	pubs := make([]identity.PubKey, 4)
	privs := make([]ed25519.PrivateKey, 4)
	for i := range pubs {
		pub, priv, _ := ed25519.GenerateKey(rand.Reader)
		copy(pubs[i][:], pub)
		privs[i] = priv
	}
	var ids [8][32]byte
	for i := range ids {
		rand.Read(ids[i][:])
	}
	now := time.Now().Unix()

	seed := make([]byte, 8)
	rand.Read(seed)
	rng := newLCG(seed)

	for step := 0; step < 2000; step++ {
		pi := int(rng.next() % uint64(len(pubs)))
		bi := int(rng.next() % uint64(len(ids)))
		pub := pubs[pi]
		id := ids[bi]
		key := modelKey{owner: identity.IDOf(pub), id: id}
		op := rng.next() % 100

		switch {
		case op < 45: // put
			payload := fmt.Appendf(nil, "payload-%d", step)
			ttl := int64(3600)
			sig := ed25519.Sign(privs[pi], blob.SigMessage(id, ttl, payload))
			rec := &blob.Record{ID: id, Identity: pub, Payload: payload, ExpiresAt: now + ttl}
			copy(rec.Sig[:], sig)
			err := s.Put(rec)
			if _, exists := model[key]; exists {
				if !errors.Is(err, blob.ErrExists) {
					t.Fatalf("step %d: dup put accepted", step)
				}
			} else if err != nil {
				t.Fatalf("step %d: put failed: %v", step, err)
			} else {
				model[key] = rec
			}
		case op < 80: // get
			got, err := s.Get(pub, id, now)
			want, exists := model[key]
			switch {
			case exists && err != nil:
				t.Fatalf("step %d: get failed: %v", step, err)
			case !exists && err == nil:
				t.Fatalf("step %d: get returned phantom blob", step)
			case exists:
				if string(got.Payload) != string(want.Payload) {
					t.Fatalf("step %d: payload mismatch", step)
				}
			}
		default: // delete
			err := s.Delete(pub, id)
			if _, exists := model[key]; exists {
				if err != nil {
					t.Fatalf("step %d: delete failed: %v", step, err)
				}
				delete(model, key)
			} else if !errors.Is(err, blob.ErrNotFound) {
				t.Fatalf("step %d: phantom delete", step)
			}
		}
	}

	// Final agreement: every model blob is present, usage matches.
	for pi := range pubs {
		var wantCount int
		var wantBytes int64
		for k, r := range model {
			if k.owner == identity.IDOf(pubs[pi]) {
				wantCount++
				wantBytes += r.Size()
			}
		}
		u := s.Usage(pubs[pi])
		if u.Count != wantCount || u.Bytes != wantBytes {
			t.Fatalf("identity %d: usage %+v, want count=%d bytes=%d",
				pi, u, wantCount, wantBytes)
		}
		if got := len(s.List(pubs[pi], now)); got != wantCount {
			t.Fatalf("identity %d: list len %d, want %d", pi, got, wantCount)
		}
	}
}

// lcg is a tiny deterministic PRNG so oracle sequences are reproducible
// from the printed seed on failure.
type lcg struct{ state uint64 }

func newLCG(seed []byte) *lcg {
	var s uint64
	for _, b := range seed {
		s = s<<8 | uint64(b)
	}
	if s == 0 {
		s = 1
	}
	return &lcg{state: s}
}

func (l *lcg) next() uint64 {
	l.state = l.state*6364136223846793005 + 1442695040888963407
	return l.state >> 33
}

// FuzzRoundTrip puts and gets a fuzzed record, asserting read-after-write
// integrity on arbitrary payloads.
func FuzzRoundTrip(f *testing.F) {
	f.Add([]byte("payload"), []byte("0123456789abcdef0123456789abcdef"))
	f.Add([]byte{}, []byte("id"))
	f.Add(make([]byte, 4096), make([]byte, 32))
	f.Fuzz(func(t *testing.T, payload, idBytes []byte) {
		if len(idBytes) != 32 || len(payload) == 0 || len(payload) > 1<<16 {
			return
		}
		s, err := OpenFS(t.TempDir(), 1<<20)
		if err != nil {
			t.Fatal(err)
		}
		pub, priv, _ := ed25519.GenerateKey(rand.Reader)
		var pk identity.PubKey
		copy(pk[:], pub)
		var id [32]byte
		copy(id[:], idBytes)
		sig := ed25519.Sign(priv, blob.SigMessage(id, 3600, payload))
		rec := &blob.Record{
			ID: id, Identity: pk, Payload: payload,
			ExpiresAt: time.Now().Unix() + 3600,
		}
		copy(rec.Sig[:], sig)
		if err := s.Put(rec); err != nil {
			t.Fatalf("put: %v", err)
		}
		got, err := s.Get(pk, id, time.Now().Unix())
		if err != nil {
			t.Fatalf("get: %v", err)
		}
		if string(got.Payload) != string(payload) {
			t.Fatal("roundtrip mismatch")
		}
		if !got.Verify(3600) {
			t.Fatal("stored record fails verification")
		}
	})
}
