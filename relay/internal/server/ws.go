package server

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/Sudo-Ivan/tactile/relay/internal/blob"
	"github.com/Sudo-Ivan/tactile/relay/internal/hub"
	"github.com/Sudo-Ivan/tactile/relay/internal/identity"
	"github.com/Sudo-Ivan/tactile/relay/internal/protocol"
	"github.com/Sudo-Ivan/tactile/relay/internal/store"
	"github.com/Sudo-Ivan/tactile/relay/internal/tier"
	"github.com/gorilla/websocket"
)

// writeBufPool shares write buffers across connections. With pooled
// buffers a conn only holds one while actually writing, which keeps idle
// conns cheaper when thousands are live.
var writeBufPool sync.Pool

var upgrader = websocket.Upgrader{
	// Blind relay: any origin may connect, there is no session to hijack.
	CheckOrigin:       func(r *http.Request) bool { return true },
	ReadBufferSize:    8 << 10,
	WriteBufferSize:   8 << 10,
	WriteBufferPool:   &writeBufPool,
	HandshakeTimeout:  10 * time.Second,
	EnableCompression: true, // permessage-deflate; payloads are ciphertext but signaling JSON compresses well
}

// conn is one websocket client. send is never closed; done signals the
// writer to stop, so a late hub publish can never panic on a closed channel.
type conn struct {
	srv       *Server
	ws        *websocket.Conn
	send      chan []byte
	done      chan struct{}
	closeOnce sync.Once
	connID    string
	pub       identity.PubKey
	id        identity.ID
	authed    bool
	challenge []byte
	chalAt    time.Time
	limits    tier.Tier
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	if !s.checkUA(w, r) {
		return
	}
	ip := s.clientIP(r)
	if !s.admitConn(ip) {
		writeErr(w, http.StatusTooManyRequests, protocol.CodeRateLimited, "connection limit")
		return
	}
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		s.releaseConn(ip)
		return
	}
	var chal [32]byte
	var cid [16]byte
	rand.Read(chal[:])
	rand.Read(cid[:])
	c := &conn{
		srv:       s,
		ws:        ws,
		send:      make(chan []byte, s.cfg.SendQueue),
		done:      make(chan struct{}),
		connID:    base64.RawURLEncoding.EncodeToString(cid[:]),
		challenge: chal[:],
		chalAt:    time.Now(),
	}
	s.mu.Lock()
	s.wss[c] = struct{}{}
	s.mu.Unlock()
	// Run both pumps in goroutines and return: a hijacked conn outlives its
	// handler, and returning frees net/http's per-request 8KB buffers.
	go c.writePump()
	go c.readPump(ip)
}

func (c *conn) writePump() {
	ping := time.NewTicker(2 * time.Minute)
	defer ping.Stop()
	for {
		select {
		case msg := <-c.send:
			_ = c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.ws.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ping.C:
			_ = c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.ws.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		case <-c.done:
			return
		}
	}
}

func (c *conn) close() {
	c.closeOnce.Do(func() {
		c.srv.mu.Lock()
		delete(c.srv.wss, c)
		c.srv.mu.Unlock()
		c.srv.unregister(c)
		close(c.done)
		_ = c.ws.Close()
	})
}

// unregister drops the conn from the hub and tells its identity's other
// devices it left.
func (s *Server) unregister(c *conn) {
	if !c.authed {
		return
	}
	s.hub.Unsubscribe(c.id, c.connID)
	if msg, err := protocol.Encode(protocol.Event{
		Type:   protocol.TypeEvent,
		Kind:   protocol.EventPeerLeft,
		ConnID: c.connID,
	}); err == nil {
		s.hub.Broadcast(c.id, msg, c.connID)
	}
}

func (c *conn) sendJSON(v any) {
	msg, err := protocol.Encode(v)
	if err != nil {
		return
	}
	select {
	case c.send <- msg:
	case <-c.done:
	default:
		// Slow consumer on a tiny message stream: drop the conn.
		go c.close()
	}
}

func (c *conn) sendErr(code, msg string) {
	c.sendJSON(protocol.Error{Type: protocol.TypeError, Code: code, Message: msg})
}

func (c *conn) readPump(ip string) {
	cfg := c.srv.cfg
	defer func() {
		c.srv.releaseConn(ip)
		c.close()
	}()

	c.sendJSON(protocol.Hello{
		Type:           protocol.TypeHello,
		Version:        protocol.Version,
		RelayID:        c.srv.relayID,
		Challenge:      b64(c.challenge),
		PoWBits:        cfg.PoWBits,
		MaxBlobSize:    cfg.MaxBlobSize,
		MinTTLSeconds:  int64(cfg.MinTTL.Seconds()),
		MaxTTLSeconds:  int64(cfg.MaxTTL.Seconds()),
		IdentityQuotaB: cfg.IdentityQuota,
		ChallengeTTLMS: cfg.ChallengeTTL.Milliseconds(),
		Now:            c.srv.now(),
	})

	c.ws.SetReadLimit(int64(cfg.MaxMsgSize))
	c.ws.SetPongHandler(func(string) error {
		return c.ws.SetReadDeadline(time.Now().Add(5 * time.Minute))
	})
	for {
		_ = c.ws.SetReadDeadline(time.Now().Add(5 * time.Minute))
		_, data, err := c.ws.ReadMessage()
		if err != nil {
			return
		}
		if !c.srv.msgRL.Allow(c.connID) {
			c.sendErr(protocol.CodeRateLimited, "message rate exceeded")
			continue
		}
		typ, msg, err := protocol.Decode(data, cfg.MaxMsgSize)
		if err != nil {
			c.sendErr(protocol.CodeBadRequest, err.Error())
			continue
		}
		if typ == protocol.TypeAuth {
			c.handleAuth(msg.(*protocol.Auth))
			continue
		}
		if !c.authed {
			c.sendErr(protocol.CodeUnauth, "auth required")
			continue
		}
		c.dispatch(typ, msg)
	}
}

func (c *conn) handleAuth(m *protocol.Auth) {
	pub, err := decodePubKey(m.PubKey)
	if err != nil {
		c.sendErr(protocol.CodeBadRequest, "bad pubkey")
		return
	}
	sig, err := decodeSig(m.Sig)
	if err != nil {
		c.sendErr(protocol.CodeBadRequest, "bad signature")
		return
	}
	if time.Since(c.chalAt) > c.srv.cfg.ChallengeTTL {
		c.sendErr(protocol.CodeExpired, "challenge expired")
		return
	}
	var nonce []byte
	if c.srv.cfg.PoWBits > 0 {
		nonce, err = base64.StdEncoding.DecodeString(m.PoWNonce)
		if err != nil || len(nonce) == 0 || len(nonce) > 32 {
			c.sendErr(protocol.CodeBadPoW, "bad pow nonce")
			return
		}
	}
	if !identity.CheckPoW(c.challenge, pub, nonce, c.srv.cfg.PoWBits) {
		c.sendErr(protocol.CodeBadPoW, "pow below difficulty")
		return
	}
	msg := make([]byte, 0, len(protocol.DomainAuth)+len(c.challenge)+len(pub))
	msg = append(msg, protocol.DomainAuth...)
	msg = append(msg, c.challenge...)
	msg = append(msg, pub[:]...)
	if !identity.Verify(pub, msg, sig) {
		c.sendErr(protocol.CodeBadSig, "signature check failed")
		return
	}
	limits, err := c.srv.limitsFor(m.Token)
	if err != nil {
		c.sendErr(protocol.CodeBadToken, "invalid or expired token")
		return
	}
	if c.authed {
		// Re-auth: drop the old registration first.
		c.srv.hub.Unsubscribe(c.id, c.connID)
	}
	c.pub = pub
	c.id = identity.IDOf(c.pub)
	c.limits = limits
	c.authed = true
	c.srv.hub.Subscribe(c.id, &hub.Subscriber{ConnID: c.connID, Send: c.send})
	c.sendJSON(protocol.OK{Type: protocol.TypeOK})
	// Tell other devices on this identity that a peer is here.
	if ev, err := protocol.Encode(protocol.Event{
		Type:   protocol.TypeEvent,
		Kind:   protocol.EventPeerJoined,
		ConnID: c.connID,
	}); err == nil {
		c.srv.hub.Broadcast(c.id, ev, c.connID)
	}
}

func (c *conn) dispatch(typ string, msg any) {
	switch typ {
	case protocol.TypePut:
		c.handlePut(msg.(*protocol.Put))
	case protocol.TypeGet:
		c.handleGet(msg.(*protocol.Get))
	case protocol.TypeDel:
		c.handleDel(msg.(*protocol.Del))
	case protocol.TypeList:
		c.handleList()
	case protocol.TypeSub:
		c.srv.hub.SetEvents(c.id, c.connID, true)
		c.sendJSON(protocol.OK{Type: protocol.TypeOK})
	case protocol.TypeSignal:
		c.handleSignal(msg.(*protocol.Signal))
	}
}

func (c *conn) handlePut(m *protocol.Put) {
	cfg := c.srv.cfg
	id, err := decodeBlobID(m.ID)
	if err != nil {
		c.sendErr(protocol.CodeBadRequest, "bad blob id")
		return
	}
	payload, err := base64.StdEncoding.DecodeString(m.Payload)
	if err != nil {
		c.sendErr(protocol.CodeBadRequest, "bad payload")
		return
	}
	if len(payload) == 0 || int64(len(payload)) > c.limits.MaxBlobBytes {
		c.sendErr(protocol.CodeTooLarge, "payload over max_blob_size")
		return
	}
	sig, err := decodeSig(m.Sig)
	if err != nil {
		c.sendErr(protocol.CodeBadRequest, "bad signature")
		return
	}
	if !identity.Verify(c.pub, blob.SigMessage(id, m.TTLSeconds, payload), sig) {
		c.sendErr(protocol.CodeBadSig, "signature check failed")
		return
	}
	// TTL negotiation: client proposes, relay clamps to the tier's bounds
	// and reports the result in put_ok.
	ttl := m.TTLSeconds
	if min := int64(cfg.MinTTL.Seconds()); ttl < min {
		ttl = min
	}
	if ttl > c.limits.MaxTTLSeconds {
		ttl = c.limits.MaxTTLSeconds
	}
	rec := &blob.Record{
		ID:        id,
		Identity:  c.pub,
		Payload:   payload,
		Sig:       sig,
		ExpiresAt: c.srv.now() + ttl,
	}
	err = c.srv.store.PutWithin(rec, c.limits.QuotaBytes, cfg.MaxStorage)
	switch {
	case err == nil:
	case errors.Is(err, store.ErrQuotaExceeded):
		c.sendErr(protocol.CodeQuotaExceeded, "identity quota exceeded")
		return
	case errors.Is(err, store.ErrStorageFull):
		c.sendErr(protocol.CodeStorageFull, "relay storage full")
		return
	case errors.Is(err, blob.ErrExists):
		c.sendErr(protocol.CodeBadRequest, "blob id exists")
		return
	default:
		c.sendErr(protocol.CodeInternal, "store failed")
		return
	}
	c.sendJSON(protocol.PutOK{Type: protocol.TypePutOK, ID: m.ID, ExpiresAt: rec.ExpiresAt})
	if ev, err := protocol.Encode(protocol.Event{
		Type: protocol.TypeEvent,
		Kind: protocol.EventBlobAdded,
		ID:   m.ID,
	}); err == nil {
		c.srv.hub.Publish(c.id, ev, c.connID)
	}
}

func (c *conn) handleGet(m *protocol.Get) {
	id, err := decodeBlobID(m.ID)
	if err != nil {
		c.sendErr(protocol.CodeBadRequest, "bad blob id")
		return
	}
	rec, err := c.srv.store.Get(c.pub, id, c.srv.now())
	if err != nil {
		if errors.Is(err, blob.ErrExpired) {
			c.sendErr(protocol.CodeExpired, "blob expired")
		} else {
			c.sendErr(protocol.CodeNotFound, "not found")
		}
		return
	}
	c.sendJSON(protocol.Blob{
		Type:      protocol.TypeBlob,
		ID:        m.ID,
		Payload:   b64(rec.Payload),
		ExpiresAt: rec.ExpiresAt,
		Sig:       b64(rec.Sig[:]),
	})
}

func (c *conn) handleDel(m *protocol.Del) {
	id, err := decodeBlobID(m.ID)
	if err != nil {
		c.sendErr(protocol.CodeBadRequest, "bad blob id")
		return
	}
	sig, err := decodeSig(m.Sig)
	if err != nil {
		c.sendErr(protocol.CodeBadRequest, "bad signature")
		return
	}
	if !identity.Verify(c.pub, blob.DelSigMessage(id), sig) {
		c.sendErr(protocol.CodeBadSig, "signature check failed")
		return
	}
	if err := c.srv.store.Delete(c.pub, id); err != nil {
		c.sendErr(protocol.CodeNotFound, "not found")
		return
	}
	c.sendJSON(protocol.OK{Type: protocol.TypeOK})
	if ev, err := protocol.Encode(protocol.Event{
		Type: protocol.TypeEvent,
		Kind: protocol.EventBlobRemoved,
		ID:   m.ID,
	}); err == nil {
		c.srv.hub.Publish(c.id, ev, c.connID)
	}
}

func (c *conn) handleList() {
	items := c.srv.store.List(c.pub, c.srv.now())
	out := protocol.Blobs{Type: protocol.TypeBlobs, Items: make([]protocol.BlobMeta, 0, len(items))}
	for _, m := range items {
		out.Items = append(out.Items, protocol.BlobMeta{
			ID:        b64(m.ID[:]),
			Size:      int(m.Size),
			ExpiresAt: m.ExpiresAt,
		})
	}
	c.sendJSON(out)
}

func (c *conn) handleSignal(m *protocol.Signal) {
	payload, err := base64.StdEncoding.DecodeString(m.Payload)
	if err != nil || len(payload) == 0 || len(payload) > 64<<10 {
		c.sendErr(protocol.CodeBadRequest, "bad signal payload")
		return
	}
	out, err := protocol.Encode(protocol.SignalFrom{
		Type:    protocol.TypeSignal,
		From:    c.connID,
		Payload: m.Payload,
	})
	if err != nil {
		return
	}
	if m.To != "" {
		if !c.srv.hub.Route(c.id, m.To, out) {
			c.sendErr(protocol.CodeNotFound, "peer not found")
		}
		return
	}
	c.srv.hub.Broadcast(c.id, out, c.connID)
}

var errBadSize = errors.New("bad size")

func decodePubKey(s string) (identity.PubKey, error) {
	var out identity.PubKey
	b, err := base64.StdEncoding.DecodeString(s)
	if err != nil || len(b) != identity.PubKeySize {
		return out, errBadSize
	}
	copy(out[:], b)
	return out, nil
}

func decodeSig(s string) (identity.Sig, error) {
	var out identity.Sig
	b, err := base64.StdEncoding.DecodeString(s)
	if err != nil || len(b) != identity.SigSize {
		return out, errBadSize
	}
	copy(out[:], b)
	return out, nil
}

func decodeBlobID(s string) ([32]byte, error) {
	var out [32]byte
	b, err := base64.StdEncoding.DecodeString(s)
	if err != nil || len(b) != 32 {
		return out, errBadSize
	}
	copy(out[:], b)
	return out, nil
}
