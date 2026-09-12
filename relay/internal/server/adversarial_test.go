package server

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"testing"
	"time"

	"github.com/Sudo-Ivan/tactile/relay/internal/identity"

	"github.com/Sudo-Ivan/tactile/relay/internal/blob"
	"github.com/Sudo-Ivan/tactile/relay/internal/protocol"
)

// TestAuthReplayAcrossChallenges: a valid auth signed for one connection's
// challenge must not authenticate another connection.
func TestAuthReplayAcrossChallenges(t *testing.T) {
	_, ts := newTestServer(t, testConfig(t))
	a := dial(t, ts)
	b := dial(t, ts)

	chalA, _ := base64.StdEncoding.DecodeString(a.hello.Challenge)
	msg := append(append([]byte{}, protocol.DomainAuth...), chalA...)
	msg = append(msg, a.pub[:]...)
	// Send a's auth on b's connection verbatim: the signature binds the
	// old challenge, so verification against b's challenge must fail.
	b.send(protocol.Auth{
		Type:   protocol.TypeAuth,
		PubKey: base64.StdEncoding.EncodeToString(a.pub[:]),
		Sig:    a.sign(msg),
	})
	if e, ok := b.read().(*protocol.Error); !ok || e.Code != protocol.CodeBadSig {
		t.Fatalf("replayed auth accepted: %#v", e)
	}
}

// TestExpiredChallenge: an auth arriving after challenge TTL is dead.
func TestExpiredChallenge(t *testing.T) {
	cfg := testConfig(t)
	cfg.ChallengeTTL = 50 * time.Millisecond
	_, ts := newTestServer(t, cfg)
	c := dial(t, ts)
	time.Sleep(100 * time.Millisecond)

	chal, _ := base64.StdEncoding.DecodeString(c.hello.Challenge)
	msg := append(append([]byte{}, protocol.DomainAuth...), chal...)
	msg = append(msg, c.pub[:]...)
	c.send(protocol.Auth{
		Type:   protocol.TypeAuth,
		PubKey: base64.StdEncoding.EncodeToString(c.pub[:]),
		Sig:    c.sign(msg),
	})
	if e, ok := c.read().(*protocol.Error); !ok || e.Code != protocol.CodeExpired {
		t.Fatalf("expected expired, got %#v", e)
	}
}

// TestForeignSignedPut: a blob signed by key B presented on a connection
// authed as A must fail verification.
func TestForeignSignedPut(t *testing.T) {
	_, ts := newTestServer(t, testConfig(t))
	a := dial(t, ts)
	a.auth()
	_, privB, _ := ed25519.GenerateKey(rand.Reader)

	var id [32]byte
	rand.Read(id[:])
	payload := []byte("x")
	put := protocol.Put{
		Type:       protocol.TypePut,
		ID:         base64.StdEncoding.EncodeToString(id[:]),
		Payload:    base64.StdEncoding.EncodeToString(payload),
		TTLSeconds: 60,
		Sig:        base64.StdEncoding.EncodeToString(ed25519.Sign(privB, blob.SigMessage(id, 60, payload))),
	}
	a.send(put)
	if e, ok := a.read().(*protocol.Error); !ok || e.Code != protocol.CodeBadSig {
		t.Fatalf("foreign-signed put accepted: %#v", e)
	}
}

// TestCrossIdentityDelete: B cannot delete A's blob even though B's del is
// properly signed under B's own identity.
func TestCrossIdentityDelete(t *testing.T) {
	_, ts := newTestServer(t, testConfig(t))
	a := dial(t, ts)
	b := dial(t, ts)
	a.auth()
	b.auth()

	var id [32]byte
	rand.Read(id[:])
	if res := a.put(id, []byte("mine"), 600); res == nil {
		t.Fatal("put failed")
	}
	// B deletes the same id under B's identity: only B's namespace.
	b.send(protocol.Del{
		Type: protocol.TypeDel, ID: base64.StdEncoding.EncodeToString(id[:]),
		Sig: b.sign(blob.DelSigMessage(id)),
	})
	if e, ok := b.read().(*protocol.Error); !ok || e.Code != protocol.CodeNotFound {
		t.Fatalf("expected not_found, got %#v", e)
	}
	// A's blob survives.
	if _, ok := a.get(id).(*protocol.Blob); !ok {
		t.Fatal("A's blob was deleted by another identity")
	}
}

// TestSameIDDifferentIdentities: blob namespaces are per-identity.
func TestSameIDDifferentIdentities(t *testing.T) {
	_, ts := newTestServer(t, testConfig(t))
	a := dial(t, ts)
	b := dial(t, ts)
	a.auth()
	b.auth()

	var id [32]byte
	rand.Read(id[:])
	a.put(id, []byte("A's blob"), 600)
	b.put(id, []byte("B's blob"), 600)

	resA := a.get(id).(*protocol.Blob)
	resB := b.get(id).(*protocol.Blob)
	pa, _ := base64.StdEncoding.DecodeString(resA.Payload)
	pb, _ := base64.StdEncoding.DecodeString(resB.Payload)
	if string(pa) != "A's blob" || string(pb) != "B's blob" {
		t.Fatal("identity namespaces leaked")
	}
}

// TestPoWBypass: with PoW on, empty and oversized nonces are rejected.
func TestPoWBypass(t *testing.T) {
	cfg := testConfig(t)
	cfg.PoWBits = 8
	_, ts := newTestServer(t, cfg)

	try := func(nonce string) *protocol.Error {
		c := dial(t, ts)
		chal, _ := base64.StdEncoding.DecodeString(c.hello.Challenge)
		msg := append(append([]byte{}, protocol.DomainAuth...), chal...)
		msg = append(msg, c.pub[:]...)
		c.send(protocol.Auth{
			Type:     protocol.TypeAuth,
			PubKey:   base64.StdEncoding.EncodeToString(c.pub[:]),
			Sig:      c.sign(msg),
			PoWNonce: nonce,
		})
		res := c.read()
		e, ok := res.(*protocol.Error)
		if !ok {
			t.Fatalf("expected error, got %#v", res)
		}
		return e
	}

	if e := try(""); e.Code != protocol.CodeBadPoW {
		t.Fatalf("empty nonce: %s", e.Code)
	}
	if e := try(base64.StdEncoding.EncodeToString(make([]byte, 64))); e.Code != protocol.CodeBadPoW {
		t.Fatalf("oversized nonce: %s", e.Code)
	}
	// A nonce verified to fail for this conn's own challenge, so the test
	// cannot flake on a lucky hash.
	c := dial(t, ts)
	chal, _ := base64.StdEncoding.DecodeString(c.hello.Challenge)
	bad := make([]byte, 8)
	for i := uint64(0); ; i++ {
		binary.LittleEndian.PutUint64(bad, i)
		if !identity.CheckPoW(chal, c.pub, bad, cfg.PoWBits) {
			break
		}
	}
	msg := append(append([]byte{}, protocol.DomainAuth...), chal...)
	msg = append(msg, c.pub[:]...)
	c.send(protocol.Auth{
		Type:     protocol.TypeAuth,
		PubKey:   base64.StdEncoding.EncodeToString(c.pub[:]),
		Sig:      c.sign(msg),
		PoWNonce: base64.StdEncoding.EncodeToString(bad),
	})
	res := c.read()
	if e, ok := res.(*protocol.Error); !ok || e.Code != protocol.CodeBadPoW {
		t.Fatalf("known-bad nonce accepted: %#v", res)
	}
}

// TestDelSigReplayAcrossIDs: a del signature for one id cannot delete
// another id.
func TestDelSigReplayAcrossIDs(t *testing.T) {
	_, ts := newTestServer(t, testConfig(t))
	c := dial(t, ts)
	c.auth()
	var id1, id2 [32]byte
	rand.Read(id1[:])
	rand.Read(id2[:])
	c.put(id1, []byte("1"), 600)
	c.put(id2, []byte("2"), 600)

	// Replay id1's del signature against id2.
	c.send(protocol.Del{
		Type: protocol.TypeDel, ID: base64.StdEncoding.EncodeToString(id2[:]),
		Sig: c.sign(blob.DelSigMessage(id1)),
	})
	if e, ok := c.read().(*protocol.Error); !ok || e.Code != protocol.CodeBadSig {
		t.Fatalf("expected bad_signature, got %#v", e)
	}
	if _, ok := c.get(id2).(*protocol.Blob); !ok {
		t.Fatal("id2 deleted via replayed signature")
	}
}

// TestReauthSwap: re-authing a connection under a different identity must
// not carry over access to the old identity's blobs.
func TestReauthSwap(t *testing.T) {
	_, ts := newTestServer(t, testConfig(t))
	c := dial(t, ts)
	c.auth()
	var id [32]byte
	rand.Read(id[:])
	c.put(id, []byte("x"), 600)

	// Swap keys on the same connection.
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	copy(c.pub[:], pub)
	c.priv = priv
	chal, _ := base64.StdEncoding.DecodeString(c.hello.Challenge)
	msg := append(append([]byte{}, protocol.DomainAuth...), chal...)
	msg = append(msg, c.pub[:]...)
	c.send(protocol.Auth{
		Type:   protocol.TypeAuth,
		PubKey: base64.StdEncoding.EncodeToString(c.pub[:]),
		Sig:    c.sign(msg),
	})
	if _, ok := c.read().(*protocol.OK); !ok {
		t.Fatal("re-auth failed")
	}
	if e, ok := c.get(id).(*protocol.Error); !ok || e.Code != protocol.CodeNotFound {
		t.Fatal("old identity's blob readable after identity swap")
	}
}

// TestTTLClamping: out-of-range TTLs clamp to relay bounds instead of
// silently storing at the requested duration.
func TestTTLClamping(t *testing.T) {
	cfg := testConfig(t)
	cfg.MinTTL = time.Hour
	cfg.MaxTTL = 24 * time.Hour
	_, ts := newTestServer(t, cfg)
	c := dial(t, ts)
	c.auth()

	var id [32]byte
	rand.Read(id[:])
	res := c.put(id, []byte("x"), 1) // below min
	ok, isOK := res.(*protocol.PutOK)
	if !isOK {
		t.Fatalf("put: %#v", res)
	}
	if ok.ExpiresAt < time.Now().Unix()+3500 {
		t.Fatalf("ttl not clamped up to min: expires %d", ok.ExpiresAt)
	}
}

// TestStorageFull is the global-cap counterpart of TestQuotaEnforcement.
func TestStorageFull(t *testing.T) {
	cfg := testConfig(t)
	cfg.MaxStorage = int64(blob.HeaderSize) + 8
	cfg.IdentityQuota = 1 << 30
	_, ts := newTestServer(t, cfg)
	a := dial(t, ts)
	b := dial(t, ts)
	a.auth()
	b.auth()

	var id1, id2 [32]byte
	rand.Read(id1[:])
	rand.Read(id2[:])
	a.put(id1, []byte("12345678"), 600)
	res := b.put(id2, []byte("12345678"), 600)
	if e, ok := res.(*protocol.Error); !ok || e.Code != protocol.CodeStorageFull {
		t.Fatalf("expected storage_full, got %#v", res)
	}
}
