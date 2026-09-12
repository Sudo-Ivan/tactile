// Package config holds publish-node configuration from flags and
// environment. Every flag has a TACTILE_PUBLISH_* environment equivalent;
// an explicitly set flag always wins over the environment.
package config

import (
	"flag"
	"fmt"
	"net/netip"
	"os"
	"strings"
	"time"
)

// EnvPrefix prefixes every environment override, e.g. TACTILE_PUBLISH_ADDR.
const EnvPrefix = "TACTILE_PUBLISH_"

// Config is the node's tunable surface. Defaults are conservative.
type Config struct {
	Addr      string // public listener: site content (and API unless AdminAddr set)
	AdminAddr string // optional dedicated API listener; empty = API shares Addr
	DataDir   string // metadata, objects, node key root (fs backend); key/cache root (s3)

	// BaseDomain enables host-based serving: {slug}.BaseDomain resolves to
	// a site. Empty disables it; /s/{slug}/ path serving still works.
	BaseDomain string
	// ReservedSlugs can never be claimed (protects operator subdomains).
	ReservedSlugs string
	// ReadOnly disables every write endpoint; run extra serving replicas.
	ReadOnly bool

	MaxBundleSize int64 // compressed deploy upload cap, bytes
	MaxSiteBytes  int64 // extracted bytes per deploy
	MaxFileBytes  int64 // per-file cap inside a bundle
	MaxFiles      int   // files per deploy
	MaxSites      int   // sites per identity
	MaxDomains    int   // verified custom domains per identity
	SiteQuota     int64 // per-identity stored bytes (deduped across deploys)
	MaxStorage    int64 // total object bytes across all identities
	KeepDeploys   int   // retained deploys per site (rollback history)

	PoWBits   int           // proof-of-work difficulty on site claims, 0 disables
	PoWWindow time.Duration // challenge validity window

	MaxConnsPerIP    int           // simultaneous connections per remote IP
	MaxConns         int           // global simultaneous connection cap, 0 = unlimited
	ConnRatePerSec   float64       // new API requests per second per IP
	ReadRatePerSec   float64       // public content requests per second per IP
	DeployRatePerSec float64       // deploys per second per identity
	SweepInterval    time.Duration // orphan object sweep period
	ManifestTTL      time.Duration // current-deploy cache TTL (HA staleness bound)
	TrustedProxies   string        // comma-separated CIDRs/IPs allowed to set X-Forwarded-For
	UAWhitelist      string        // comma-separated User-Agent prefixes for the API; empty = off
	DNSResolver      string        // resolver host:port for domain TXT checks; empty = system

	// CacheDir is a local object cache for the s3 backend; empty = no cache.
	CacheDir string

	// S3 backend. When Bucket is set the node stores objects and metadata
	// in S3 instead of the filesystem, which is the HA deployment mode.
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
}

// Default returns production-reasonable defaults.
func Default() Config {
	return Config{
		Addr:             ":8472",
		DataDir:          "./publish-data",
		ReservedSlugs:    "www,api,app,s,mail,ftp,cdn,static",
		MaxBundleSize:    64 << 20,  // 64 MiB compressed
		MaxSiteBytes:     256 << 20, // 256 MiB extracted per deploy
		MaxFileBytes:     16 << 20,
		MaxFiles:         2000,
		MaxSites:         2,
		MaxDomains:       1,
		SiteQuota:        256 << 20,
		MaxStorage:       32 << 30, // 32 GiB total
		KeepDeploys:      10,
		PoWBits:          16,
		PoWWindow:        10 * time.Minute,
		MaxConnsPerIP:    64,
		ConnRatePerSec:   8,
		ReadRatePerSec:   120,
		DeployRatePerSec: 0.2, // one deploy per 5s sustained
		SweepInterval:    10 * time.Minute,
		ManifestTTL:      5 * time.Second,
		Backend:          "fs",
	}
}

// Flags binds the config to a FlagSet.
func (c *Config) Flags(fs *flag.FlagSet) {
	fs.StringVar(&c.Addr, "addr", c.Addr, "public listen address (site content; API too unless -admin-addr)")
	fs.StringVar(&c.AdminAddr, "admin-addr", c.AdminAddr, "dedicated API listen address (empty = share -addr)")
	fs.StringVar(&c.DataDir, "data", c.DataDir, "storage directory (metadata, objects, node key)")
	fs.StringVar(&c.BaseDomain, "base-domain", c.BaseDomain, "serve sites at {slug}.<base-domain> (empty = path mode only)")
	fs.StringVar(&c.ReservedSlugs, "reserved-slugs", c.ReservedSlugs, "comma-separated slugs that cannot be claimed")
	fs.BoolVar(&c.ReadOnly, "read-only", c.ReadOnly, "disable all write endpoints (serving replica)")
	fs.Int64Var(&c.MaxBundleSize, "max-bundle-size", c.MaxBundleSize, "max compressed deploy upload bytes")
	fs.Int64Var(&c.MaxSiteBytes, "max-site-bytes", c.MaxSiteBytes, "max extracted bytes per deploy")
	fs.Int64Var(&c.MaxFileBytes, "max-file-bytes", c.MaxFileBytes, "max bytes per file in a bundle")
	fs.IntVar(&c.MaxFiles, "max-files", c.MaxFiles, "max files per deploy")
	fs.IntVar(&c.MaxSites, "max-sites", c.MaxSites, "max sites per identity")
	fs.IntVar(&c.MaxDomains, "max-domains", c.MaxDomains, "max verified custom domains per identity")
	fs.Int64Var(&c.SiteQuota, "site-quota", c.SiteQuota, "per-identity stored bytes")
	fs.Int64Var(&c.MaxStorage, "max-storage", c.MaxStorage, "total stored object bytes")
	fs.IntVar(&c.KeepDeploys, "keep-deploys", c.KeepDeploys, "deploys retained per site for rollback")
	fs.IntVar(&c.PoWBits, "pow-bits", c.PoWBits, "site-claim proof-of-work bits (0 disables)")
	fs.DurationVar(&c.PoWWindow, "pow-window", c.PoWWindow, "proof-of-work challenge validity")
	fs.IntVar(&c.MaxConnsPerIP, "max-conns-per-ip", c.MaxConnsPerIP, "connections per remote IP")
	fs.IntVar(&c.MaxConns, "max-conns", c.MaxConns, "global simultaneous connection cap (0 = unlimited)")
	fs.Float64Var(&c.ConnRatePerSec, "conn-rate", c.ConnRatePerSec, "API requests/sec per IP")
	fs.Float64Var(&c.ReadRatePerSec, "read-rate", c.ReadRatePerSec, "public content requests/sec per IP")
	fs.Float64Var(&c.DeployRatePerSec, "deploy-rate", c.DeployRatePerSec, "deploys/sec per identity")
	fs.DurationVar(&c.SweepInterval, "sweep-interval", c.SweepInterval, "orphan object sweep period")
	fs.DurationVar(&c.ManifestTTL, "manifest-ttl", c.ManifestTTL, "current-deploy cache TTL (HA staleness bound)")
	fs.StringVar(&c.TrustedProxies, "trusted-proxies", c.TrustedProxies,
		"comma-separated proxy IPs/CIDRs trusted to provide X-Forwarded-For")
	fs.StringVar(&c.UAWhitelist, "ua-whitelist", c.UAWhitelist,
		"comma-separated User-Agent prefixes allowed to use the API (empty = off)")
	fs.StringVar(&c.DNSResolver, "dns-resolver", c.DNSResolver,
		"resolver host:port for custom-domain TXT checks (empty = system resolver)")
	fs.StringVar(&c.CacheDir, "cache-dir", c.CacheDir, "local object cache dir for the s3 backend (empty = off)")
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
}

// ApplyEnv applies TACTILE_PUBLISH_* environment variables to flags that
// were not set explicitly on the command line. Call after fs.Parse.
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

// Reserved returns the reserved-slug set.
func (c *Config) Reserved() map[string]bool {
	m := make(map[string]bool)
	for _, s := range strings.Split(c.ReservedSlugs, ",") {
		if s = strings.TrimSpace(s); s != "" {
			m[s] = true
		}
	}
	return m
}
