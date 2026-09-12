// Package protocol defines the wire protocol between client and relay.
// Messages are strict JSON envelopes over a WebSocket connection. The relay
// never sees plaintext: blob payloads are client-side ciphertext.
package protocol

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
)

// Version is the protocol version implemented by this package.
const Version = 1

// REST API paths. The server mounts handlers on these patterns and the
// client builds request URLs from the same constants, so the two can
// never drift.
const (
	PathInfo   = "/v1/info"
	PathHealth = "/v1/health"
	PathWS     = "/v1/ws"
	PathBlobs  = "/v1/blobs"
	PathBlob   = "/v1/blobs/{id}" // mux pattern; clients append "/" + id to PathBlobs
)

// Message types, client to server.
const (
	TypeAuth   = "auth"   // authenticate this connection
	TypePut    = "put"    // store a blob
	TypeGet    = "get"    // fetch a blob by id
	TypeDel    = "del"    // delete a blob by id
	TypeList   = "list"   // list the caller's blobs
	TypeSub    = "sub"    // subscribe to events for the caller's identity
	TypeSignal = "signal" // route an opaque frame to a peer connection (WebRTC signaling)
)

// Message types, server to client.
const (
	TypeHello = "hello" // capabilities + auth challenge, sent on connect
	TypeOK    = "ok"
	TypePutOK = "put_ok"
	TypeError = "error"
	TypeBlob  = "blob"
	TypeBlobs = "blobs"
	TypeEvent = "event"
)

// Error codes returned in Error.Code and mirrored as HTTP statuses by the REST API.
const (
	CodeBadRequest    = "bad_request"
	CodeUnauth        = "unauthenticated"
	CodeBadSig        = "bad_signature"
	CodeBadPoW        = "bad_pow"
	CodeNotFound      = "not_found"
	CodeTooLarge      = "too_large"
	CodeQuotaExceeded = "quota_exceeded"
	CodeStorageFull   = "storage_full"
	CodeRateLimited   = "rate_limited"
	CodeExpired       = "expired"
	CodeBadToken      = "bad_token"
	CodeForbiddenUA   = "forbidden"
	CodeInternal      = "internal"
)

// Signature domain separators. Every signature covers a domain prefix so a
// signature produced for one purpose can never be replayed for another.
var (
	DomainAuth   = []byte("tactile-relay/auth/v1")
	DomainBlob   = []byte("tactile-relay/blob/v1")
	DomainDel    = []byte("tactile-relay/del/v1")
	DomainREST   = []byte("tactile-relay/rest/v1")
	DomainSignal = []byte("tactile-relay/signal/v1")
)

// Hello is the first server message on every connection.
type Hello struct {
	Type           string `json:"type"`
	Version        int    `json:"version"`
	RelayID        string `json:"relay_id"` // stable relay identifier, hash of a generated key
	Challenge      string `json:"challenge"`
	PoWBits        int    `json:"pow_bits"`
	MaxBlobSize    int    `json:"max_blob_size"`
	MinTTLSeconds  int64  `json:"min_ttl_seconds"`
	MaxTTLSeconds  int64  `json:"max_ttl_seconds"`
	IdentityQuotaB int64  `json:"identity_quota_bytes"`
	ChallengeTTLMS int64  `json:"challenge_ttl_ms"`
	Now            int64  `json:"now"` // server unix time, for client clock sanity checks
}

// Auth authenticates a connection. Sig covers
// DomainAuth || challenge || pubkey. PoWNonce satisfies CheckPoW when the
// relay advertises pow_bits > 0.
type Auth struct {
	Type     string `json:"type"`
	PubKey   string `json:"pubkey"` // base64, 32 bytes
	Sig      string `json:"sig"`
	PoWNonce string `json:"pow_nonce,omitempty"`
	Token    string `json:"token,omitempty"` // paid-tier bearer token, if the relay takes them
}

// Put stores a blob. Sig covers
// DomainBlob || id || ttl_seconds(LE64) || payload.
type Put struct {
	Type       string `json:"type"`
	ID         string `json:"id"` // base64, 32 bytes, client chosen
	Payload    string `json:"payload"`
	TTLSeconds int64  `json:"ttl_seconds"`
	Sig        string `json:"sig"`
}

// PutOK acknowledges a stored blob.
type PutOK struct {
	Type      string `json:"type"`
	ID        string `json:"id"`
	ExpiresAt int64  `json:"expires_at"`
}

// Get fetches a blob owned by the caller's identity.
type Get struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

// Del removes a blob. Sig covers DomainDel || id.
type Del struct {
	Type string `json:"type"`
	ID   string `json:"id"`
	Sig  string `json:"sig"`
}

// List requests the caller's blob metadata.
type List struct {
	Type string `json:"type"`
}

// Sub subscribes this connection to events for the caller's identity.
type Sub struct {
	Type string `json:"type"`
}

// Signal routes an opaque payload to another connection of the same
// identity, for WebRTC offer/answer/ICE exchange. To is the peer conn id
// announced in peer events; empty broadcasts to all other conns.
type Signal struct {
	Type    string `json:"type"`
	To      string `json:"to,omitempty"`
	Payload string `json:"payload"` // base64, opaque to the relay
}

// Blob is a stored blob returned to a client.
type Blob struct {
	Type      string `json:"type"`
	ID        string `json:"id"`
	Payload   string `json:"payload"`
	ExpiresAt int64  `json:"expires_at"`
	Sig       string `json:"sig"`
}

// BlobMeta is a blob's listing entry.
type BlobMeta struct {
	ID        string `json:"id"`
	Size      int    `json:"size"`
	ExpiresAt int64  `json:"expires_at"`
}

// Blobs is the list response.
type Blobs struct {
	Type  string     `json:"type"`
	Items []BlobMeta `json:"items"`
}

// Event kinds.
const (
	EventBlobAdded   = "blob_added"
	EventBlobRemoved = "blob_removed"
	EventPeerJoined  = "peer_joined"
	EventPeerLeft    = "peer_left"
)

// Event notifies subscribers.
type Event struct {
	Type   string `json:"type"`
	Kind   string `json:"kind"`
	ID     string `json:"id,omitempty"`   // blob id for blob events
	ConnID string `json:"conn,omitempty"` // peer conn id for peer events
}

// SignalFrom is a routed signal frame delivered to a peer.
type SignalFrom struct {
	Type    string `json:"type"`
	From    string `json:"from"`
	Payload string `json:"payload"`
}

// OK is a generic acknowledgement.
type OK struct {
	Type string `json:"type"`
}

// Error is a failure response.
type Error struct {
	Type    string `json:"type"`
	Code    string `json:"code"`
	Message string `json:"message,omitempty"`
}

// ErrMessageTooLarge is returned by Decode when input exceeds the limit.
var ErrMessageTooLarge = errors.New("protocol: message too large")

// Decode parses a strict JSON message and returns its type name plus the
// decoded struct. Unknown fields are rejected.
func Decode(data []byte, maxSize int) (string, any, error) {
	if len(data) > maxSize {
		return "", nil, ErrMessageTooLarge
	}
	var head struct {
		Type string `json:"type"`
	}
	// The head pass is lenient; the typed pass below is strict.
	if err := json.Unmarshal(data, &head); err != nil {
		return "", nil, err
	}
	var msg any
	switch head.Type {
	case TypeAuth:
		msg = &Auth{}
	case TypePut:
		msg = &Put{}
	case TypeGet:
		msg = &Get{}
	case TypeDel:
		msg = &Del{}
	case TypeList:
		msg = &List{}
	case TypeSub:
		msg = &Sub{}
	case TypeSignal:
		msg = &Signal{}
	default:
		return "", nil, fmt.Errorf("protocol: unknown type %q", head.Type)
	}
	if err := strictUnmarshal(data, msg); err != nil {
		return "", nil, err
	}
	return head.Type, msg, nil
}

func strictUnmarshal(data []byte, v any) error {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return err
	}
	if dec.More() {
		return errors.New("protocol: trailing data")
	}
	return nil
}

// Encode marshals a message. Message structs must set their Type field.
func Encode(v any) ([]byte, error) {
	return json.Marshal(v)
}
