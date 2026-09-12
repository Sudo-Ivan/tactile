package blob

import (
	"bytes"
	"encoding/base64"
	"encoding/hex"
	"testing"

	"github.com/Sudo-Ivan/tactile/relay/internal/identity"
)

// Known-answer test pinning the signed message format. If SigMessage ever
// changes shape, this fails and wire compat is visibly broken.
func TestSigMessageKnownAnswer(t *testing.T) {
	idB, _ := base64.StdEncoding.DecodeString("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=")
	pubB, _ := base64.StdEncoding.DecodeString("A6EHv/POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg=")
	sigB, _ := base64.StdEncoding.DecodeString("WuVzJrWHsHsojflxRO6+3E/F723URPcum+UDkiAQaYpNvbOvaVahUD3CPJl4t+VQJt5n0MOyG+vI/Ics4pBrAA==")
	payload := []byte("known answer test payload")
	ttl := int64(86400)

	var id [32]byte
	copy(id[:], idB)
	var pub identity.PubKey
	copy(pub[:], pubB)
	var sig identity.Sig
	copy(sig[:], sigB)

	// The signed preimage must be exactly domain || id || ttl_le64 || payload.
	want, err := hex.DecodeString(
		"74616374696c652d72656c61792f626c6f622f7631" +
			"000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f" +
			"8051010000000000" +
			"6b6e6f776e20616e737765722074657374207061796c6f6164")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(SigMessage(id, ttl, payload), want) {
		t.Fatal("SigMessage format drifted from the pinned vector")
	}

	rec := &Record{ID: id, Identity: pub, Payload: payload, Sig: sig}
	if !rec.Verify(ttl) {
		t.Fatal("pinned signature rejected: verify path changed")
	}
}
