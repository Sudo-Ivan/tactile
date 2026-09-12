package hub

import (
	"sync"
	"testing"
	"time"

	"github.com/Sudo-Ivan/tactile/relay/internal/identity"
)

func testID(b byte) identity.ID {
	var id identity.ID
	id[0] = b
	return id
}

func sub(connID string, events bool, n int) (*Subscriber, chan []byte) {
	ch := make(chan []byte, n)
	return &Subscriber{ConnID: connID, Events: events, Send: ch}, ch
}

func TestPublishToEventSubscribers(t *testing.T) {
	h := New()
	id := testID(1)
	a, ach := sub("a", true, 4)
	b, bch := sub("b", false, 4)
	h.Subscribe(id, a)
	h.Subscribe(id, b)

	h.Publish(id, []byte("evt"), "")
	select {
	case msg := <-ach:
		if string(msg) != "evt" {
			t.Fatal("bad msg")
		}
	default:
		t.Fatal("a got nothing")
	}
	select {
	case <-bch:
		t.Fatal("b should not get events")
	default:
	}
}

func TestBroadcastIgnoresEventsFlag(t *testing.T) {
	h := New()
	id := testID(2)
	a, ach := sub("a", false, 4)
	h.Subscribe(id, a)
	h.Broadcast(id, []byte("sig"), "nobody")
	select {
	case msg := <-ach:
		if string(msg) != "sig" {
			t.Fatal("bad msg")
		}
	default:
		t.Fatal("broadcast missed")
	}
}

func TestRoute(t *testing.T) {
	h := New()
	id := testID(3)
	a, _ := sub("a", false, 4)
	b, bch := sub("b", false, 4)
	h.Subscribe(id, a)
	h.Subscribe(id, b)
	if !h.Route(id, "b", []byte("hi")) {
		t.Fatal("route failed")
	}
	select {
	case msg := <-bch:
		if string(msg) != "hi" {
			t.Fatal("bad msg")
		}
	default:
		t.Fatal("b got nothing")
	}
	if h.Route(id, "ghost", []byte("x")) {
		t.Fatal("routed to nonexistent conn")
	}
}

func TestSlowConsumerSkipped(t *testing.T) {
	h := New()
	id := testID(4)
	a, ach := sub("a", true, 1)
	h.Subscribe(id, a)
	h.Publish(id, []byte("1"), "")
	h.Publish(id, []byte("2"), "") // dropped, channel full
	h.Publish(id, []byte("3"), "") // dropped
	got := <-ach
	if string(got) != "1" {
		t.Fatalf("got %q", got)
	}
	select {
	case <-ach:
		t.Fatal("expected drop")
	case <-time.After(50 * time.Millisecond):
	}
}

func TestUnsubscribe(t *testing.T) {
	h := New()
	id := testID(5)
	a, ach := sub("a", true, 4)
	h.Subscribe(id, a)
	h.Unsubscribe(id, "a")
	h.Publish(id, []byte("x"), "")
	select {
	case <-ach:
		t.Fatal("unsubscribed conn got event")
	default:
	}
	if len(h.Conns(id)) != 0 {
		t.Fatal("conns leaked")
	}
}

// TestConcurrent exercises the hub under -race.
func TestConcurrent(t *testing.T) {
	h := New()
	id := testID(6)
	var wg sync.WaitGroup
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			s, _ := sub(string(rune('a'+i)), true, 8)
			h.Subscribe(id, s)
			h.SetEvents(id, s.ConnID, true)
			for j := 0; j < 50; j++ {
				h.Publish(id, []byte("x"), "")
				h.Broadcast(id, []byte("y"), "")
				h.Route(id, s.ConnID, []byte("z"))
				h.Conns(id)
			}
			h.Unsubscribe(id, s.ConnID)
		}(i)
	}
	wg.Wait()
}
