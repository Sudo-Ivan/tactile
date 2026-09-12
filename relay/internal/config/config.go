// Package config holds relay configuration from flags and environment.
// Every flag has a TACTILE_RELAY_* environment equivalent; an explicitly
// set flag always wins over the environment.
package config

import (
	"flag"
	"fmt"
	"net/netip"
	"os"
	"strings"
	"time"
)

// EnvPrefix prefixes every environment override, e.g. TACTILE_RELAY_ADDR.
const EnvPrefix = "TACTILE_RELAY_"

// Config is the relay's tunable surface. Defaults are conservative.
type Config struct {
	Addr           string        // listen address
	DataDir        string        // blob storage root
	MaxBlobSize    int           // per-blob payload cap, bytes
	MaxMsgSize     int           // websocket frame cap, bytes
	MinTTL         time.Duration // shortest accepted retention
	MaxTTL         time.Duration // longest accepted retention
	IdentityQuota  int64         // per-identity stored bytes
	MaxStorage     int64         // total stored bytes across all identities
	PoWBits        int           // proof-of-work difficulty on auth, 0 disables
	ChallengeTTL   time.Duration // auth challenge validity
	SendQueue      int           // per-connection outbound buffer
	MaxConnsPerIP  int           // simultaneous connections per remote IP
	ConnRatePerSec float64       // new connections per second per IP
	MsgRatePerSec  float64       // messages per second per connection
	MaxConns       int           // global simultaneous connection cap, 0 = unlimited
	SweepInterval  time.Duration // expired blob sweep period
	TrustedProxies string        // comma-separated CIDRs/IPs allowed to set X-Forwarded-For

	// S3 backend. When Bucket is set the relay stores blobs in S3 instead
	// of the filesystem.
	Backend     string // "fs" (default) or "s3"
	S3Endpoint  string // e.g. https://s3.amazonaws.com or http://minio:9000
	S3Region    string // e.g. us-east-1; "auto" for R2
	S3Bucket    string
	S3AccessKey string
	S3SecretKey string
	S3PathStyle bool   // bucket/key in path; required by MinIO/Garage/R2/B2
	S3Prefix    string // key prefix inside the bucket

	// Paid tiers, off by default. Setting secrets enables token support.
	TokenSecrets string // comma-separated HMAC secrets; multiple allow rotation
	TiersFile    string // JSON file overriding the built-in tier table
	UAWhitelist  string // comma-separated User-Agent prefixes; empty = off
}

// Default returns production-reasonable defaults.
func Default() Config {
	return Config{
		Addr:           ":8471",
		DataDir:        "./relay-data",
		MaxBlobSize:    1 << 20, // 1 MiB
		MaxMsgSize:     1<<20 + 1<<18,
		MinTTL:         time.Hour,
		MaxTTL:         30 * 24 * time.Hour,
		IdentityQuota:  64 << 20, // 64 MiB per identity
		MaxStorage:     4 << 30,  // 4 GiB total
		PoWBits:        18,
		ChallengeTTL:   60 * time.Second,
		SendQueue:      64,
		MaxConnsPerIP:  16,
		ConnRatePerSec: 4,
		MsgRatePerSec:  30,
		SweepInterval:  time.Minute,
		Backend:        "fs",
	}
}

// Flags binds the config to a FlagSet.
func (c *Config) Flags(fs *flag.FlagSet) {
	fs.StringVar(&c.Addr, "addr", c.Addr, "listen address")
	fs.StringVar(&c.DataDir, "data", c.DataDir, "blob storage directory")
	fs.IntVar(&c.MaxBlobSize, "max-blob-size", c.MaxBlobSize, "max blob payload bytes")
	fs.IntVar(&c.MaxMsgSize, "max-msg-size", c.MaxMsgSize, "max websocket message bytes")
	fs.DurationVar(&c.MinTTL, "min-ttl", c.MinTTL, "minimum blob retention")
	fs.DurationVar(&c.MaxTTL, "max-ttl", c.MaxTTL, "maximum blob retention")
	fs.Int64Var(&c.IdentityQuota, "identity-quota", c.IdentityQuota, "per-identity stored bytes")
	fs.Int64Var(&c.MaxStorage, "max-storage", c.MaxStorage, "total stored bytes")
	fs.IntVar(&c.PoWBits, "pow-bits", c.PoWBits, "auth proof-of-work bits (0 disables)")
	fs.DurationVar(&c.ChallengeTTL, "challenge-ttl", c.ChallengeTTL, "auth challenge validity")
	fs.IntVar(&c.SendQueue, "send-queue", c.SendQueue, "per-connection outbound buffer")
	fs.IntVar(&c.MaxConnsPerIP, "max-conns-per-ip", c.MaxConnsPerIP, "connections per remote IP")
	fs.Float64Var(&c.ConnRatePerSec, "conn-rate", c.ConnRatePerSec, "new connections/sec per IP")
	fs.Float64Var(&c.MsgRatePerSec, "msg-rate", c.MsgRatePerSec, "messages/sec per connection")
	fs.IntVar(&c.MaxConns, "max-conns", c.MaxConns, "global simultaneous connection cap (0 = unlimited)")
	fs.DurationVar(&c.SweepInterval, "sweep-interval", c.SweepInterval, "expired blob sweep period")
	fs.StringVar(&c.TrustedProxies, "trusted-proxies", c.TrustedProxies,
		"comma-separated proxy IPs/CIDRs trusted to provide X-Forwarded-For")
	fs.StringVar(&c.Backend, "backend", c.Backend, "storage backend: fs or s3")
	fs.StringVar(&c.S3Endpoint, "s3-endpoint", c.S3Endpoint, "S3 endpoint URL")
	fs.StringVar(&c.S3Region, "s3-region", c.S3Region, "S3 region (auto for R2)")
	fs.StringVar(&c.S3Bucket, "s3-bucket", c.S3Bucket, "S3 bucket")
	fs.StringVar(&c.S3AccessKey, "s3-access-key", c.S3AccessKey, "S3 access key")
	fs.StringVar(&c.S3SecretKey, "s3-secret-key", c.S3SecretKey, "S3 secret key")
	fs.BoolVar(&c.S3PathStyle, "s3-path-style", c.S3PathStyle, "path-style S3 addressing (MinIO/Garage/R2/B2)")
	fs.StringVar(&c.S3Prefix, "s3-prefix", c.S3Prefix, "key prefix inside the bucket")
	fs.StringVar(&c.TokenSecrets, "token-secrets", c.TokenSecrets,
		"comma-separated HMAC secrets enabling paid tiers (prefer env var)")
	fs.StringVar(&c.TiersFile, "tiers-file", c.TiersFile, "JSON file overriding built-in tiers")
	fs.StringVar(&c.UAWhitelist, "ua-whitelist", c.UAWhitelist,
		"comma-separated User-Agent prefixes allowed to use the API (empty = off)")
}

// ApplyEnv applies TACTILE_RELAY_* environment variables to flags that were
// not set explicitly on the command line. Call after fs.Parse.
func ApplyEnv(fs *flag.FlagSet) error {
	set := make(map[string]bool)
	fs.Visit(func(f *flag.Flag) { set[f.Name] = true })
	var err error
	fs.VisitAll(func(f *flag.Flag) {
		if err != nil || set[f.Name] {
			return
		}
		name := EnvPrefix + strings.ToUpper(strings.ReplaceAll(f.Name, "-", "_"))
		v, ok := os.LookupEnv(name)
		if !ok {
			return
		}
		if e := f.Value.Set(v); e != nil {
			err = fmt.Errorf("%s: %w", name, e)
		}
	})
	return err
}

// ParseTrustedProxies parses the TrustedProxies list into prefixes. A bare
// IP becomes a /32 or /128 host prefix.
func (c *Config) ParseTrustedProxies() ([]netip.Prefix, error) {
	if c.TrustedProxies == "" {
		return nil, nil
	}
	var out []netip.Prefix
	for _, s := range strings.Split(c.TrustedProxies, ",") {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if p, err := netip.ParsePrefix(s); err == nil {
			out = append(out, p.Masked())
			continue
		}
		if a, err := netip.ParseAddr(s); err == nil {
			out = append(out, netip.PrefixFrom(a, a.BitLen()))
			continue
		}
		return nil, fmt.Errorf("bad trusted proxy %q (want IP or CIDR)", s)
	}
	return out, nil
}
