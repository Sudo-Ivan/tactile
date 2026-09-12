// Package blob defines the stored record and its on-disk format. The relay
// only ever stores signed ciphertext; it cannot read or forge payloads.
package blob

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"

	"github.com/Sudo-Ivan/tactile/relay/internal/identity"
	"github.com/Sudo-Ivan/tactile/relay/internal/protocol"
)

// File header layout, all little-endian:
//
//	magic      [4]  "TBLB"
//	version    u8
//	flags      u8
//	reserved   u16
//	expiresAt  i64  unix seconds
//	payloadLen u32
//	identity   [32] Ed25519 pubkey of the owner
//	id         [32] blob id
//	sig        [64] Ed25519 signature over the blob domain fields
//
// HeaderSize = 4+1+1+2+8+4+32+32+64 = 148
const (
	HeaderSize = 148
	magic      = "TBLB"
	version    = 1
)

// Errors returned by blob parsing and the store.
var (
	ErrBadMagic   = errors.New("blob: bad magic")
	ErrBadVersion = errors.New("blob: unsupported version")
	ErrShort      = errors.New("blob: truncated header")
	ErrBadID      = errors.New("blob: invalid id size")
	ErrExists     = errors.New("blob: id already exists")
	ErrNotFound   = errors.New("blob: not found")
	ErrExpired    = errors.New("blob: expired")
)

// Record is a stored blob with its verified envelope.
type Record struct {
	ID        [32]byte
	Identity  identity.PubKey
	Payload   []byte
	Sig       identity.Sig
	ExpiresAt int64 // unix seconds
}

// Size is the on-disk size.
func (r *Record) Size() int64 {
	return HeaderSize + int64(len(r.Payload))
}

// Expired reports whether the record is past expiry at unix time now.
func (r *Record) Expired(now int64) bool {
	return r.ExpiresAt <= now
}

// SigMessage builds the exact byte string the client signs for a put.
func SigMessage(id [32]byte, ttlSeconds int64, payload []byte) []byte {
	var ttl [8]byte
	// #nosec G115 -- the two's-complement bit pattern is what the client
	// signs; negative TTLs are rejected by policy, not by encoding.
	binary.LittleEndian.PutUint64(ttl[:], uint64(ttlSeconds))
	msg := make([]byte, 0, len(protocol.DomainBlob)+32+8+len(payload))
	msg = append(msg, protocol.DomainBlob...)
	msg = append(msg, id[:]...)
	msg = append(msg, ttl[:]...)
	return append(msg, payload...)
}

// DelSigMessage builds the signed bytes for a delete.
func DelSigMessage(id [32]byte) []byte {
	msg := make([]byte, 0, len(protocol.DomainDel)+32)
	msg = append(msg, protocol.DomainDel...)
	return append(msg, id[:]...)
}

// Verify checks the record's signature against its contents. ttlSeconds is
// the TTL the client requested, not the stored expiry.
func (r *Record) Verify(ttlSeconds int64) bool {
	return identity.Verify(r.Identity, SigMessage(r.ID, ttlSeconds, r.Payload), r.Sig)
}

// Marshal writes the record in on-disk form.
func Marshal(w io.Writer, r *Record) error {
	var hdr [HeaderSize]byte
	copy(hdr[0:4], magic)
	hdr[4] = version
	// flags + reserved zero
	// #nosec G115 -- ExpiresAt is a unix timestamp; the bit pattern round-trips.
	binary.LittleEndian.PutUint64(hdr[8:16], uint64(r.ExpiresAt))
	// #nosec G115 -- payload size is bounded by maxPayload at every call site.
	binary.LittleEndian.PutUint32(hdr[16:20], uint32(len(r.Payload)))
	copy(hdr[20:52], r.Identity[:])
	copy(hdr[52:84], r.ID[:])
	copy(hdr[84:148], r.Sig[:])
	if _, err := w.Write(hdr[:]); err != nil {
		return err
	}
	_, err := w.Write(r.Payload)
	return err
}

// Meta is a parsed header without the payload.
type Meta struct {
	ID        [32]byte
	Identity  identity.PubKey
	Sig       identity.Sig
	ExpiresAt int64
	PayloadN  uint32
}

// UnmarshalHeader parses a header from r.
func UnmarshalHeader(r io.Reader) (*Meta, error) {
	var hdr [HeaderSize]byte
	if _, err := io.ReadFull(r, hdr[:]); err != nil {
		if err == io.EOF || err == io.ErrUnexpectedEOF {
			return nil, ErrShort
		}
		return nil, err
	}
	if string(hdr[0:4]) != magic {
		return nil, ErrBadMagic
	}
	if hdr[4] != version {
		return nil, ErrBadVersion
	}
	m := &Meta{
		// #nosec G115 -- stored as the raw bit pattern of a unix timestamp.
		ExpiresAt: int64(binary.LittleEndian.Uint64(hdr[8:16])),
		PayloadN:  binary.LittleEndian.Uint32(hdr[16:20]),
	}
	copy(m.Identity[:], hdr[20:52])
	copy(m.ID[:], hdr[52:84])
	copy(m.Sig[:], hdr[84:148])
	return m, nil
}

// Unmarshal reads a full record. maxPayload bounds the allocation; a header
// advertising more is rejected before the payload is read.
func Unmarshal(r io.Reader, maxPayload int) (*Record, error) {
	m, err := UnmarshalHeader(r)
	if err != nil {
		return nil, err
	}
	if int(m.PayloadN) > maxPayload {
		return nil, fmt.Errorf("blob: payload %d over limit %d", m.PayloadN, maxPayload)
	}
	rec := &Record{
		ID:        m.ID,
		Identity:  m.Identity,
		Sig:       m.Sig,
		ExpiresAt: m.ExpiresAt,
		Payload:   make([]byte, m.PayloadN),
	}
	if _, err := io.ReadFull(r, rec.Payload); err != nil {
		return nil, err
	}
	return rec, nil
}
