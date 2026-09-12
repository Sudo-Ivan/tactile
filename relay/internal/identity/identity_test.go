package identity

import (
	"crypto/ed25519"
	"crypto/rand"
	"testing"
)

func TestIDOf(t *testing.T) {
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	var pk PubKey
	copy(pk[:], pub)
	id1 := IDOf(pk)
	id2 := IDOf(pk)
	if id1 != id2 {
		t.Fatal("IDOf not deterministic")
	}
	pub2, _, _ := ed25519.GenerateKey(rand.Reader)
	var pk2 PubKey
	copy(pk2[:], pub2)
	if IDOf(pk2) == id1 {
		t.Fatal("different keys produced same ID")
	}
}

func TestVerify(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	var pk PubKey
	copy(pk[:], pub)
	msg := []byte("hello relay")
	var sig Sig
	copy(sig[:], ed25519.Sign(priv, msg))
	if !Verify(pk, msg, sig) {
		t.Fatal("valid signature rejected")
	}
	if Verify(pk, []byte("tampered"), sig) {
		t.Fatal("invalid signature accepted")
	}
}

func TestVerifyDetached(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	var pk PubKey
	copy(pk[:], pub)
	parts := [][]byte{[]byte("dom"), []byte("a"), []byte("b")}
	var sig Sig
	copy(sig[:], ed25519.Sign(priv, []byte("domab")))
	if !VerifyDetached(pk, sig, parts...) {
		t.Fatal("valid detached signature rejected")
	}
}

func TestLeadingZeroBits(t *testing.T) {
	cases := []struct {
		b    []byte
		want int
	}{
		{[]byte{0x00, 0x00, 0x01}, 23},
		{[]byte{0x00, 0x80}, 8},
		{[]byte{0xff}, 0},
		{[]byte{0x0f}, 4},
		{[]byte{0x00}, 8},
	}
	for _, c := range cases {
		if got := LeadingZeroBits(c.b); got != c.want {
			t.Errorf("LeadingZeroBits(%x) = %d, want %d", c.b, got, c.want)
		}
	}
}

func FuzzLeadingZeroBits(f *testing.F) {
	f.Add([]byte{0x00, 0x00, 0x01})
	f.Add([]byte{})
	f.Add([]byte{0xff, 0xff})
	f.Fuzz(func(t *testing.T, data []byte) {
		got := LeadingZeroBits(data)
		if got < 0 || got > len(data)*8 {
			t.Fatalf("LeadingZeroBits out of range: %d for %d bytes", got, len(data))
		}
		// Invariant: the counted bits are actually zero.
		for i := 0; i < got; i++ {
			if data[i/8]&(0x80>>uint(i%8)) != 0 {
				t.Fatalf("bit %d is set but counted", i)
			}
		}
	})
}

func TestCheckPoW(t *testing.T) {
	challenge := make([]byte, 32)
	rand.Read(challenge)
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	var pk PubKey
	copy(pk[:], pub)

	// Difficulty 0 always passes.
	if !CheckPoW(challenge, pk, nil, 0) {
		t.Fatal("difficulty 0 rejected")
	}
	// Grind a nonce for difficulty 8: ~256 tries expected.
	var nonce [8]byte
	var i int
	for i = 0; i < 1<<20; i++ {
		nonce[0] = byte(i)
		nonce[1] = byte(i >> 8)
		if CheckPoW(challenge, pk, nonce[:], 8) {
			break
		}
	}
	if i == 1<<20 {
		t.Fatal("no nonce found at 8 bits")
	}
	if CheckPoW(challenge, pk, nonce[:], 8) != true {
		t.Fatal("valid nonce rejected")
	}
	// A fixed bad nonce should (almost surely) fail at 24 bits.
	if CheckPoW(challenge, pk, []byte{0}, 24) {
		t.Fatal("difficulty 24 passed with nonce 0x00")
	}
}
