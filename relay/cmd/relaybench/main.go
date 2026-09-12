// Command relaybench load-tests a running relay and reports throughput
// and latency percentiles.
package main

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"flag"
	"fmt"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Sudo-Ivan/tactile/relay/client"
)

const (
	defaultRelays = "http://127.0.0.1:8471" // -relays default
	poolSize      = 256                     // warmup blob pool, cycled by readers
)

func main() {
	relays := flag.String("relays", defaultRelays, "comma-separated relay URLs")
	workers := flag.Int("workers", 64, "concurrent workers")
	duration := flag.Duration("duration", 10*time.Second, "test duration")
	payload := flag.Int("payload", 512, "blob payload bytes")
	mode := flag.String("mode", "get", "put | get | mixed")
	flag.Parse()

	urls := strings.Split(*relays, ",")
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	c := client.New(urls, priv)

	// Warmup: one shared identity, a pool of blobs to read.
	var ids [poolSize][32]byte
	body := make([]byte, *payload)
	rand.Read(body)
	if *mode != "put" {
		for i := range ids {
			rand.Read(ids[i][:])
			if err := c.Put(context.Background(), ids[i], body, 3600, 1); err != nil {
				fmt.Println("warmup put:", err)
			}
		}
	}

	var ops, errs atomic.Int64
	lat := make([][]time.Duration, *workers)
	var wg sync.WaitGroup
	deadline := time.Now().Add(*duration)
	var counter atomic.Int64

	for w := 0; w < *workers; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			var seq int64
			for time.Now().Before(deadline) {
				var id [32]byte
				var err error
				op := *mode
				if op == "mixed" {
					if counter.Add(1)%2 == 0 {
						op = "put"
					} else {
						op = "get"
					}
				}
				start := time.Now()
				switch op {
				case "put":
					rand.Read(id[:])
					err = c.Put(context.Background(), id, body, 3600, 1)
				default:
					id = ids[int(seq)%poolSize]
					_, err = c.Get(context.Background(), id)
				}
				lat[w] = append(lat[w], time.Since(start))
				ops.Add(1)
				if err != nil {
					errs.Add(1)
				}
				seq++
			}
		}(w)
	}
	wg.Wait()

	var all []time.Duration
	for _, l := range lat {
		all = append(all, l...)
	}
	sort.Slice(all, func(i, j int) bool { return all[i] < all[j] })
	p := func(q float64) time.Duration {
		if len(all) == 0 {
			return 0
		}
		return all[int(float64(len(all))*q)]
	}
	total := ops.Load()
	fmt.Printf("mode=%s workers=%d duration=%s payload=%dB\n", *mode, *workers, *duration, *payload)
	fmt.Printf("ops=%d errors=%d rps=%.0f\n", total, errs.Load(), float64(total)/duration.Seconds())
	fmt.Printf("p50=%s p95=%s p99=%s max=%s\n", p(0.5), p(0.95), p(0.99), all[len(all)-1])
}
