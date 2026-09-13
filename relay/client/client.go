// Package client is a multi-relay client for the Tactile sync protocol.
//
// Relays are independent and interchangeable: the client writes signed
// ciphertext to every healthy relay and reads the union. It ranks relays
// by measured latency and routes around slow or saturated ones, which is
// how operators get HA without any federation between relays.
package client

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Sudo-Ivan/tactile/relay/internal/blob"
	"github.com/Sudo-Ivan/tactile/relay/internal/identity"
	"github.com/Sudo-Ivan/tactile/relay/internal/protocol"
)

// ErrNoRelay reports that every configured relay failed.
var ErrNoRelay = errors.New("client: all relays failed")

// ErrNotFound reports that no relay had the blob.
var ErrNotFound = errors.New("client: blob not found on any relay")

// Info mirrors the relay's /v1/info response.
type Info struct {
	Version        int    `json:"version"`
	RelayID        string `json:"relay_id"`
	PoWBits        int    `json:"pow_bits"`
	MaxBlobSize    int    `json:"max_blob_size"`
	MinTTLSeconds  int64  `json:"min_ttl_seconds"`
	MaxTTLSeconds  int64  `json:"max_ttl_seconds"`
	IdentityQuotaB int64  `json:"identity_quota_bytes"`
	Now            int64  `json:"now"`
	Load           struct {
		Conns          int   `json:"conns"`
		MaxConns       int   `json:"max_conns"`
		StorageBytes   int64 `json:"storage_bytes"`
		StorageCap     int64 `json:"storage_cap"`
		StorageUsedPct int   `json:"storage_used_pct"`
	} `json:"load"`
}

type relayStat struct {
	ewma   time.Duration // smoothed latency
	fails  int           // consecutive failures
	probed bool
}

// Client syncs against a set of relays.
type Client struct {
	relays []string
	priv   ed25519.PrivateKey
	pub    identity.PubKey
	hc     *http.Client
	ua     string

	mu    sync.Mutex
	stats map[string]*relayStat
}

// Option configures a Client.
type Option func(*Client)

// WithUserAgent overrides the client User-Agent. Operators running UA
// whitelists should set this to their app's name.
func WithUserAgent(ua string) Option {
	return func(c *Client) { c.ua = ua }
}

// DefaultUA is sent on every request so relay operators can tell real
// clients from scrapers.
const DefaultUA = "tactile-client/1"

// HTTP client tunables. Conns are pooled and reused across relays; the
// default MaxIdleConnsPerHost of 2 would churn dials under parallel
// fan-out.
const (
	httpClientTimeout   = 15 * time.Second
	maxIdleConns        = 256
	maxIdleConnsPerHost = 64
	idleConnTimeout     = 90 * time.Second
	tlsHandshakeTimeout = 10 * time.Second
)

// New builds a client. relays are base URLs like http://127.0.0.1:8471.
func New(relays []string, priv ed25519.PrivateKey, opts ...Option) *Client {
	var pub identity.PubKey
	copy(pub[:], priv.Public().(ed25519.PublicKey))
	c := &Client{
		relays: relays,
		priv:   priv,
		pub:    pub,
		ua:     DefaultUA,
		hc: &http.Client{
			Timeout: httpClientTimeout,
			Transport: &http.Transport{
				MaxIdleConns:        maxIdleConns,
				MaxIdleConnsPerHost: maxIdleConnsPerHost,
				IdleConnTimeout:     idleConnTimeout,
				TLSHandshakeTimeout: tlsHandshakeTimeout,
				ForceAttemptHTTP2:   true,
			},
		},
		stats: make(map[string]*relayStat),
	}
	for _, o := range opts {
		o(c)
	}
	return c
}

// setHeaders applies the User-Agent to a request.
func (c *Client) setHeaders(req *http.Request) {
	req.Header.Set("User-Agent", c.ua)
}

// drain finishes a response body so the conn can be reused. The transport
// only returns a conn to the pool when the body is read to EOF and closed.
func drain(res *http.Response) {
	_, _ = io.Copy(io.Discard, res.Body)
	_ = res.Body.Close()
}

func (c *Client) stat(url string) *relayStat {
	s := c.stats[url]
	if s == nil {
		s = &relayStat{ewma: time.Second}
		c.stats[url] = s
	}
	return s
}

// observe records a request's latency and success.
func (c *Client) observe(url string, d time.Duration, failed bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	s := c.stat(url)
	if failed {
		s.fails++
		return
	}
	s.fails = 0
	const alpha = 0.3
	s.ewma = time.Duration(float64(s.ewma)*(1-alpha) + float64(d)*alpha)
	s.probed = true
}

// ranked returns relay URLs sorted by effective latency. Relays with
// recent failures are penalized; unknown relays sort mid-pack.
func (c *Client) ranked() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := append([]string{}, c.relays...)
	score := func(u string) float64 {
		s := c.stat(u)
		penalty := 1 << min(s.fails, 10)
		return float64(s.ewma) * float64(penalty)
	}
	sort.SliceStable(out, func(i, j int) bool { return score(out[i]) < score(out[j]) })
	return out
}

// Probe measures /v1/info round-trip for every relay concurrently and
// updates latency stats. Returns per-relay info keyed by URL; unreachable
// relays get a nil entry.
func (c *Client) Probe(ctx context.Context) map[string]*Info {
	out := make(map[string]*Info, len(c.relays))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, u := range c.relays {
		wg.Add(1)
		go func(u string) {
			defer wg.Done()
			start := time.Now()
			req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u+protocol.PathInfo, nil)
			c.setHeaders(req)
			res, err := c.hc.Do(req)
			if err != nil {
				c.observe(u, time.Since(start), true)
				return
			}
			var info Info
			err = json.NewDecoder(res.Body).Decode(&info)
			drain(res)
			ok := err == nil && res.StatusCode == http.StatusOK
			c.observe(u, time.Since(start), !ok)
			if ok {
				mu.Lock()
				out[u] = &info
				mu.Unlock()
			}
		}(u)
	}
	wg.Wait()
	return out
}

func (c *Client) sign(msg []byte) string {
	return base64.StdEncoding.EncodeToString(ed25519.Sign(c.priv, msg))
}

func (c *Client) pubB64() string {
	return base64.StdEncoding.EncodeToString(c.pub[:])
}

// Put writes a blob to every healthy relay concurrently. It succeeds when
// at least min(quorum, len(relays)) writes land; default quorum is 1.
func (c *Client) Put(ctx context.Context, id [32]byte, payload []byte, ttlSeconds int64, quorum int) error {
	sig := c.sign(blob.SigMessage(id, ttlSeconds, payload))
	if quorum <= 0 {
		quorum = 1
	}
	var mu sync.Mutex
	var succeeded, failed int
	var firstErr error
	var wg sync.WaitGroup
	done := make(chan struct{})

	for _, u := range c.ranked() {
		wg.Add(1)
		go func(u string) {
			defer wg.Done()
			start := time.Now()
			err := c.putOne(ctx, u, id, payload, ttlSeconds, sig)
			c.observe(u, time.Since(start), err != nil && !errors.Is(err, errExists))
			mu.Lock()
			if err == nil || errors.Is(err, errExists) {
				succeeded++
			} else {
				failed++
				if firstErr == nil {
					firstErr = err
				}
			}
			if succeeded >= quorum || succeeded+failed == len(c.relays) {
				select {
				case <-done:
				default:
					close(done)
				}
			}
			mu.Unlock()
		}(u)
	}
	wg.Wait()
	if succeeded >= quorum {
		return nil
	}
	if firstErr != nil {
		return firstErr
	}
	return ErrNoRelay
}

var errExists = errors.New("client: blob already stored")

func (c *Client) putOne(ctx context.Context, u string, id [32]byte, payload []byte, ttl int64, sig string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, u+protocol.PathBlobs, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("X-Tactile-Identity", c.pubB64())
	req.Header.Set("X-Tactile-Blob-Id", base64.StdEncoding.EncodeToString(id[:]))
	req.Header.Set("X-Tactile-Ttl", strconv.FormatInt(ttl, 10))
	req.Header.Set("X-Tactile-Signature", sig)
	c.setHeaders(req)
	res, err := c.hc.Do(req)
	if err != nil {
		return err
	}
	defer drain(res)
	switch res.StatusCode {
	case http.StatusCreated, http.StatusOK:
		return nil
	case http.StatusConflict:
		return errExists
	default:
		return fmt.Errorf("relay %s: status %d", u, res.StatusCode)
	}
}

// Get fetches a blob, trying relays in latency order and falling back on
// failure or saturation.
func (c *Client) Get(ctx context.Context, id [32]byte) ([]byte, error) {
	lastErr := ErrNotFound
	for _, u := range c.ranked() {
		start := time.Now()
		payload, err := c.getOne(ctx, u, id)
		c.observe(u, time.Since(start), err != nil && !errors.Is(err, ErrNotFound))
		if err == nil {
			return payload, nil
		}
		if !errors.Is(err, ErrNotFound) {
			lastErr = err
		}
	}
	return nil, lastErr
}

// GetRange fetches payload bytes [start, end) from the fastest relay.
// end=0 means to the end. Returns payload slice and total size.
func (c *Client) GetRange(ctx context.Context, id [32]byte, start, end int64) ([]byte, int64, error) {
	lastErr := ErrNotFound
	for _, u := range c.ranked() {
		ts := strconv.FormatInt(time.Now().Unix(), 10)
		msg := append(append([]byte{}, protocol.DomainREST...), []byte("GET")...)
		msg = append(msg, id[:]...)
		msg = append(msg, ts...)
		spec := "bytes=" + strconv.FormatInt(start, 10) + "-"
		if end > 0 {
			spec += strconv.FormatInt(end-1, 10)
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet,
			u+protocol.PathBlobs+"/"+base64.RawURLEncoding.EncodeToString(id[:])+"?raw=1", nil)
		if err != nil {
			return nil, 0, err
		}
		req.Header.Set("Range", spec)
		req.Header.Set("X-Tactile-Identity", c.pubB64())
		req.Header.Set("X-Tactile-Timestamp", ts)
		req.Header.Set("X-Tactile-Signature", c.sign(msg))
		t0 := time.Now()
		c.setHeaders(req)
		res, err := c.hc.Do(req)
		if err != nil {
			c.observe(u, time.Since(t0), true)
			lastErr = err
			continue
		}
		body, err := io.ReadAll(res.Body)
		_ = res.Body.Close() // fully read: conn is reusable
		if res.StatusCode == http.StatusNotFound || res.StatusCode == http.StatusGone {
			continue
		}
		if err != nil || (res.StatusCode != http.StatusOK && res.StatusCode != http.StatusPartialContent) {
			c.observe(u, time.Since(t0), true)
			lastErr = fmt.Errorf("relay %s: status %d", u, res.StatusCode)
			continue
		}
		c.observe(u, time.Since(t0), false)
		var total int64 = -1
		if cr := res.Header.Get("Content-Range"); cr != "" {
			if i := strings.LastIndexByte(cr, '/'); i >= 0 {
				if v, err := strconv.ParseInt(cr[i+1:], 10, 64); err == nil {
					total = v
				}
			}
		}
		if total < 0 {
			total = int64(len(body))
		}
		return body, total, nil
	}
	return nil, 0, lastErr
}

func (c *Client) getOne(ctx context.Context, u string, id [32]byte) ([]byte, error) {
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	msg := append(append([]byte{}, protocol.DomainREST...), []byte("GET")...)
	msg = append(msg, id[:]...)
	msg = append(msg, ts...)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		u+protocol.PathBlobs+"/"+base64.RawURLEncoding.EncodeToString(id[:]), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Tactile-Identity", c.pubB64())
	req.Header.Set("X-Tactile-Timestamp", ts)
	req.Header.Set("X-Tactile-Signature", c.sign(msg))
	c.setHeaders(req)
	res, err := c.hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer drain(res)
	if res.StatusCode == http.StatusNotFound || res.StatusCode == http.StatusGone {
		return nil, ErrNotFound
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("relay %s: status %d", u, res.StatusCode)
	}
	var out struct {
		Payload string `json:"payload"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return nil, err
	}
	return base64.StdEncoding.DecodeString(out.Payload)
}

// ListItem is a blob entry with the relay that served it.
type ListItem struct {
	ID        [32]byte
	Size      int64
	ExpiresAt int64
}

// List unions blob listings across every reachable relay, keeping the
// freshest expiry per id.
func (c *Client) List(ctx context.Context) ([]ListItem, error) {
	var mu sync.Mutex
	merged := make(map[[32]byte]ListItem)
	var anyOK bool
	var wg sync.WaitGroup
	for _, u := range c.ranked() {
		wg.Add(1)
		go func(u string) {
			defer wg.Done()
			start := time.Now()
			items, err := c.listOne(ctx, u)
			c.observe(u, time.Since(start), err != nil)
			if err != nil {
				return
			}
			mu.Lock()
			anyOK = true
			for _, it := range items {
				if cur, ok := merged[it.ID]; !ok || it.ExpiresAt > cur.ExpiresAt {
					merged[it.ID] = it
				}
			}
			mu.Unlock()
		}(u)
	}
	wg.Wait()
	if !anyOK && len(c.relays) > 0 {
		return nil, ErrNoRelay
	}
	out := make([]ListItem, 0, len(merged))
	for _, it := range merged {
		out = append(out, it)
	}
	sort.Slice(out, func(i, j int) bool {
		return bytes.Compare(out[i].ID[:], out[j].ID[:]) < 0
	})
	return out, nil
}

func (c *Client) listOne(ctx context.Context, u string) ([]ListItem, error) {
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	msg := append(append([]byte{}, protocol.DomainREST...), []byte("LIST")...)
	msg = append(msg, ts...)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u+protocol.PathBlobs, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Tactile-Identity", c.pubB64())
	req.Header.Set("X-Tactile-Timestamp", ts)
	req.Header.Set("X-Tactile-Signature", c.sign(msg))
	c.setHeaders(req)
	res, err := c.hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer drain(res)
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("relay %s: status %d", u, res.StatusCode)
	}
	var out struct {
		Items []struct {
			ID        string `json:"id"`
			Size      int64  `json:"size"`
			ExpiresAt int64  `json:"expires_at"`
		} `json:"items"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return nil, err
	}
	var items []ListItem
	for _, it := range out.Items {
		b, err := base64.StdEncoding.DecodeString(it.ID)
		if err != nil || len(b) != 32 {
			continue
		}
		var id [32]byte
		copy(id[:], b)
		items = append(items, ListItem{ID: id, Size: it.Size, ExpiresAt: it.ExpiresAt})
	}
	return items, nil
}

// Delete removes a blob from every reachable relay.
func (c *Client) Delete(ctx context.Context, id [32]byte) error {
	sig := c.sign(blob.DelSigMessage(id))
	var anyOK bool
	var lastErr error
	for _, u := range c.ranked() {
		start := time.Now()
		req, err := http.NewRequestWithContext(ctx, http.MethodDelete,
			u+protocol.PathBlobs+"/"+base64.RawURLEncoding.EncodeToString(id[:]), nil)
		if err != nil {
			continue
		}
		req.Header.Set("X-Tactile-Identity", c.pubB64())
		req.Header.Set("X-Tactile-Signature", sig)
		c.setHeaders(req)
		res, err := c.hc.Do(req)
		c.observe(u, time.Since(start), err != nil)
		if err != nil {
			lastErr = err
			continue
		}
		drain(res)
		if res.StatusCode == http.StatusNoContent || res.StatusCode == http.StatusOK {
			anyOK = true
			continue
		}
		if res.StatusCode != http.StatusNotFound {
			lastErr = fmt.Errorf("relay %s: status %d", u, res.StatusCode)
		} else {
			anyOK = true // already gone here is fine
		}
	}
	if anyOK {
		return nil
	}
	if lastErr != nil {
		return lastErr
	}
	return ErrNoRelay
}
