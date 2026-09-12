// Package ratelimit provides keyed token buckets for connection and
// request throttling. Buckets are created lazily and swept when idle so the
// map cannot grow without bound.
package ratelimit

import (
	"sync"
	"time"
)

type bucket struct {
	tokens float64
	last   time.Time
}

// Limiter is a set of per-key token buckets.
type Limiter struct {
	mu        sync.Mutex
	rate      float64 // tokens per second
	burst     float64
	buckets   map[string]*bucket
	lastSweep time.Time
}

// New returns a limiter allowing burst tokens then refilling at rate
// tokens/second.
func New(rate, burst float64) *Limiter {
	return &Limiter{
		rate:    rate,
		burst:   burst,
		buckets: make(map[string]*bucket),
	}
}

// Allow consumes one token for key.
func (l *Limiter) Allow(key string) bool {
	return l.AllowN(key, 1)
}

// AllowN consumes n tokens for key.
func (l *Limiter) AllowN(key string, n float64) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.sweepLocked(time.Now())
	b := l.buckets[key]
	if b == nil {
		b = &bucket{tokens: l.burst, last: time.Now()}
		l.buckets[key] = b
	}
	elapsed := time.Since(b.last).Seconds()
	b.last = time.Now()
	b.tokens += elapsed * l.rate
	if b.tokens > l.burst {
		b.tokens = l.burst
	}
	if b.tokens < n {
		return false
	}
	b.tokens -= n
	return true
}

// sweepLocked drops buckets that have been full and idle for ten minutes,
// bounding memory use against key-spraying.
func (l *Limiter) sweepLocked(now time.Time) {
	if now.Sub(l.lastSweep) < time.Minute {
		return
	}
	l.lastSweep = now
	for k, b := range l.buckets {
		if b.tokens >= l.burst && now.Sub(b.last) > 10*time.Minute {
			delete(l.buckets, k)
		}
	}
}
