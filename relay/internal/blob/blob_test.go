package blob

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"io"
	"testing"
)

func testRecord(t *testing.T) (*Record, ed25519.PrivateKey, int64) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	var id [32]byte
	rand.Read(id[:])
	ttl := int64(3600)
	payload := []byte("ciphertext goes here")
	sig := ed25519.Sign(priv, SigMessage(id, ttl, payload))
	rec := &Record{ID: id, Payload: payload, ExpiresAt: 1700000000 + ttl}
	copy(rec.Identity[:], pub)
	copy(rec.Sig[:], sig)
	return rec, priv, ttl
}

func TestMarshalRoundtrip(t *testing.T) {
	rec, _, _ := testRecord(t)
	var buf bytes.Buffer
	if err := Marshal(&buf, rec); err != nil {
		t.Fatal(err)
	}
	if buf.Len() != int(rec.Size()) {
		t.Fatalf("size = %d want %d", buf.Len(), rec.Size())
	}
	out, err := Unmarshal(&buf, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	if out.ID != rec.ID || out.Identity != rec.Identity || out.ExpiresAt != rec.ExpiresAt {
		t.Fatal("header mismatch")
	}
	if !bytes.Equal(out.Payload, rec.Payload) {
		t.Fatal("payload mismatch")
	}
}

func TestVerify(t *testing.T) {
	rec, _, ttl := testRecord(t)
	if !rec.Verify(ttl) {
		t.Fatal("valid record rejected")
	}
	rec.Payload[0] ^= 1
	if rec.Verify(ttl) {
		t.Fatal("tampered payload accepted")
	}
}

func TestUnmarshalRejects(t *testing.T) {
	rec, _, _ := testRecord(t)
	var buf bytes.Buffer
	Marshal(&buf, rec)
	raw := buf.Bytes()

	// Truncated header.
	if _, err := UnmarshalHeader(bytes.NewReader(raw[:10])); !errors.Is(err, ErrShort) {
		t.Fatalf("short header: %v", err)
	}
	// Bad magic.
	bad := bytes.Clone(raw)
	bad[0] = 'X'
	if _, err := UnmarshalHeader(bytes.NewReader(bad)); !errors.Is(err, ErrBadMagic) {
		t.Fatalf("bad magic: %v", err)
	}
	// Bad version.
	bad = bytes.Clone(raw)
	bad[4] = 99
	if _, err := UnmarshalHeader(bytes.NewReader(bad)); !errors.Is(err, ErrBadVersion) {
		t.Fatalf("bad version: %v", err)
	}
	// Advertised payload over limit.
	if _, err := Unmarshal(bytes.NewReader(raw), 1); err == nil {
		t.Fatal("oversized payload accepted")
	}
	// Truncated payload.
	if _, err := Unmarshal(bytes.NewReader(raw[:len(raw)-2]), 1<<20); err == nil {
		t.Fatal("truncated payload accepted")
	}
}

func FuzzUnmarshalHeader(f *testing.F) {
	rec, _, _ := testRecord(&testing.T{})
	var buf bytes.Buffer
	Marshal(&buf, rec)
	f.Add(buf.Bytes())
	f.Add([]byte("TBLB"))
	f.Add([]byte{})
	f.Fuzz(func(t *testing.T, data []byte) {
		UnmarshalHeader(bytes.NewReader(data))
		if m, err := UnmarshalHeader(bytes.NewReader(data)); err == nil {
			// If the header parsed, a bounded Unmarshal must not panic.
			Unmarshal(io.MultiReader(bytes.NewReader(data)), 1<<20)
			_ = m
		}
	})
}
