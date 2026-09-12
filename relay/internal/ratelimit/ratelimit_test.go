package ratelimit

import (
	"testing"
	"time"
)

func TestAllowBurst(t *testing.T) {
	l := New(1, 3)
	for i := 0; i < 3; i++ {
		if !l.Allow("k") {
			t.Fatalf("burst %d rejected", i)
		}
	}
	if l.Allow("k") {
		t.Fatal("over-burst allowed")
	}
}

func TestRefill(t *testing.T) {
	l := New(100, 1) // 100/s = 10ms per token
	if !l.Allow("k") {
		t.Fatal("first rejected")
	}
	if l.Allow("k") {
		t.Fatal("second allowed too soon")
	}
	time.Sleep(20 * time.Millisecond)
	if !l.Allow("k") {
		t.Fatal("refill failed")
	}
}

func TestKeyIsolation(t *testing.T) {
	l := New(0.001, 1)
	l.Allow("a")
	if l.Allow("a") {
		t.Fatal("a should be empty")
	}
	if !l.Allow("b") {
		t.Fatal("b blocked by a's bucket")
	}
}

func TestConcurrent(t *testing.T) {
	l := New(1000, 10)
	done := make(chan struct{})
	for i := 0; i < 8; i++ {
		go func(i int) {
			for j := 0; j < 100; j++ {
				l.Allow(string(rune('a' + i)))
			}
			done <- struct{}{}
		}(i)
	}
	for i := 0; i < 8; i++ {
		<-done
	}
}
