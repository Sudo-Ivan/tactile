// Package identity provides the publish identity model: an Ed25519 public
// key is the identity, and the identity ID is the SHA-256 of that key,
// adapted from Reticulum's model where a destination is just a key hash.
package identity

import (
	"crypto/ed25519"
	"crypto/sha256"
	"errors"
	"math/bits"
)

// Field sizes in bytes.
const (
	PubKeySize = ed25519.PublicKeySize // 32
	SigSize    = ed25519.SignatureSize // 64
	IDSize     = sha256.Size           // 32
)

// PubKey is an Ed25519 public key, which is the whole identity.
type PubKey [PubKeySize]byte

// Sig is an Ed25519 signature.
type Sig [SigSize]byte

// ID is the identity's addressable form, sha256 of the public key.
type ID [IDSize]byte

// IDOf derives the identity ID from a public key.
func IDOf(pub PubKey) ID {
	return ID(sha256.Sum256(pub[:]))
}

// Verify checks an Ed25519 signature.
func Verify(pub PubKey, msg []byte, sig Sig) bool {
	return ed25519.Verify(ed25519.PublicKey(pub[:]), msg, sig[:])
}

// VerifyDetached verifies sig over the concatenation of parts.
func VerifyDetached(pub PubKey, sig Sig, parts ...[]byte) bool {
	var n int
	for _, p := range parts {
		n += len(p)
	}
	msg := make([]byte, 0, n)
	for _, p := range parts {
		msg = append(msg, p...)
	}
	return Verify(pub, msg, sig)
}

// ErrBadPoW reports a proof of work below the required difficulty.
var ErrBadPoW = errors.New("identity: proof of work does not meet difficulty")

// CheckPoW verifies that sha256(challenge || pubkey || nonce) has at least
// bits leading zero bits. Cheap to verify, expensive to mint: this throttles
// Sybil site claims without accounts.
func CheckPoW(challenge []byte, pub PubKey, nonce []byte, bits int) bool {
	if bits <= 0 {
		return true
	}
	h := sha256.New()
	h.Write(challenge)
	h.Write(pub[:])
	h.Write(nonce)
	return LeadingZeroBits(h.Sum(nil)) >= bits
}

// LeadingZeroBits counts zero bits from the most significant end.
func LeadingZeroBits(b []byte) int {
	var n int
	for _, c := range b {
		if c == 0 {
			n += 8
			continue
		}
		n += bits.LeadingZeros8(c)
		return n
	}
	return n
}
