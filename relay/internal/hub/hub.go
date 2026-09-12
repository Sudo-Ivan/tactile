// Package hub routes live events and signaling frames between the
// connections of one identity. It is transport-agnostic: a subscriber is any
// value with a bounded send channel, so the same hub can back WebSocket
// clients today and other transports later.
package hub

import (
	"sync"

	"github.com/Sudo-Ivan/tactile/relay/internal/identity"
)

// Subscriber is a connection registered under an identity. Events selects
// whether it receives blob/peer events; signaling frames route to all
// connections regardless.
type Subscriber struct {
	ConnID string
	Events bool
	Send   chan<- []byte // bounded; a full channel means a slow consumer
}

// Hub fans out events to subscribers grouped by identity.
type Hub struct {
	mu   sync.RWMutex
	subs map[identity.ID]map[string]*Subscriber
}

// New returns an empty hub.
func New() *Hub {
	return &Hub{subs: make(map[identity.ID]map[string]*Subscriber)}
}

// Subscribe registers a subscriber for an identity. Returns false if the
// conn id is already subscribed for that identity.
func (h *Hub) Subscribe(id identity.ID, s *Subscriber) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	m := h.subs[id]
	if m == nil {
		m = make(map[string]*Subscriber)
		h.subs[id] = m
	}
	if _, ok := m[s.ConnID]; ok {
		return false
	}
	m[s.ConnID] = s
	return true
}

// SetEvents toggles event delivery for an existing subscriber.
func (h *Hub) SetEvents(id identity.ID, connID string, on bool) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	s := h.subs[id][connID]
	if s == nil {
		return false
	}
	s.Events = on
	return true
}

// Unsubscribe removes a subscriber.
func (h *Hub) Unsubscribe(id identity.ID, connID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if m := h.subs[id]; m != nil {
		delete(m, connID)
		if len(m) == 0 {
			delete(h.subs, id)
		}
	}
}

// Publish sends msg to every event subscriber of id except excludeConnID.
// Slow consumers are skipped rather than blocking the hub.
func (h *Hub) Publish(id identity.ID, msg []byte, excludeConnID string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for cid, s := range h.subs[id] {
		if cid == excludeConnID || !s.Events {
			continue
		}
		select {
		case s.Send <- msg:
		default:
		}
	}
}

// Broadcast sends msg to every connection of id except excludeConnID,
// ignoring the Events flag. Used for signaling, which all peers need.
func (h *Hub) Broadcast(id identity.ID, msg []byte, excludeConnID string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for cid, s := range h.subs[id] {
		if cid == excludeConnID {
			continue
		}
		select {
		case s.Send <- msg:
		default:
		}
	}
}

// Route sends msg to one subscriber of id. Returns false if absent.
func (h *Hub) Route(id identity.ID, connID string, msg []byte) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	s := h.subs[id][connID]
	if s == nil {
		return false
	}
	select {
	case s.Send <- msg:
		return true
	default:
		return false
	}
}

// Conns returns the conn ids subscribed for an identity.
func (h *Hub) Conns(id identity.ID) []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]string, 0, len(h.subs[id]))
	for cid := range h.subs[id] {
		out = append(out, cid)
	}
	return out
}
