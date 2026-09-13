// Command publish runs a Tactile publish node: a self-hostable static
// site host for client-rendered notes, an Obsidian Publish alternative.
package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/Sudo-Ivan/tactile/publish/internal/config"
	"github.com/Sudo-Ivan/tactile/publish/internal/s3client"
	"github.com/Sudo-Ivan/tactile/publish/internal/server"
	"github.com/Sudo-Ivan/tactile/publish/internal/store"
)

// Set by -ldflags at build time, e.g.
// go build -ldflags "-X main.version=1.0.0 -X main.commit=abc123 -X main.date=..."
var (
	version = "dev"
	commit  = "none"
	date    = "unknown"
)

func main() {
	cfg := config.Default()
	fs := flag.NewFlagSet("publish", flag.ExitOnError)
	cfg.Flags(fs)
	var showVersion bool
	var healthCheck bool
	fs.BoolVar(&showVersion, "v", false, "print version and exit")
	fs.BoolVar(&showVersion, "version", false, "print version and exit")
	fs.BoolVar(&healthCheck, "healthcheck", false,
		"probe the health endpoint on -addr and exit nonzero on failure")
	fs.Usage = func() {
		_, _ = fmt.Fprintf(fs.Output(), `tactile-publish %s (commit %s, built %s)

Self-hostable static publishing node for Tactile. Clients upload rendered
site bundles signed with their Ed25519 key; the node serves them at
{slug}.<base-domain>, custom domains, or /s/{slug}/ paths.

Usage: publish [flags]

Every flag has an environment override named %s<FLAG_NAME>,
e.g. -addr -> %sADDR. Explicit flags win over the environment.

Flags:
`, version, commit, date, config.EnvPrefix, config.EnvPrefix)
		fs.PrintDefaults()
	}
	_ = fs.Parse(os.Args[1:])

	if showVersion {
		fmt.Printf("tactile-publish %s\ncommit %s\nbuilt  %s\n", version, commit, date)
		return
	}
	if err := config.ApplyEnv(fs); err != nil {
		log.Fatalf("env config: %v", err)
	}
	if healthCheck {
		os.Exit(probeHealth(cfg.Addr))
	}

	st, err := openBackend(cfg)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	srv, err := server.New(cfg, st)
	if err != nil {
		log.Fatalf("server: %v", err)
	}

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		_ = srv.Close()
	}()

	mode := "fs"
	if cfg.Backend == "s3" {
		mode = "s3 (HA-capable)"
	}
	if cfg.AdminAddr != "" {
		log.Printf("publish %s public=%s admin=%s backend=%s base=%s",
			srv.NodeID(), cfg.Addr, cfg.AdminAddr, mode, cfg.BaseDomain)
	} else {
		log.Printf("publish %s listening on %s, backend %s, base domain %q",
			srv.NodeID(), cfg.Addr, mode, cfg.BaseDomain)
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

// probeHealth GETs /v1/health on the configured address and returns a
// process exit code. It exists so minimal container images with no shell
// or wget can still run a Docker healthcheck.
func probeHealth(addr string) int {
	host := addr
	if strings.HasPrefix(addr, ":") {
		host = "127.0.0.1" + addr
	}
	hc := &http.Client{Timeout: 3 * time.Second}
	res, err := hc.Get("http://" + host + "/v1/health")
	if err != nil {
		return 1
	}
	_ = res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

func openBackend(cfg config.Config) (store.Backend, error) {
	switch cfg.Backend {
	case "fs", "":
		return store.OpenFS(cfg.DataDir)
	case "s3":
		cli := s3client.New(s3client.Config{
			Endpoint:  cfg.S3Endpoint,
			Region:    cfg.S3Region,
			Bucket:    cfg.S3Bucket,
			AccessKey: cfg.S3AccessKey,
			SecretKey: cfg.S3SecretKey,
			PathStyle: cfg.S3PathStyle,
			Prefix:    cfg.S3Prefix,
		})
		return store.NewS3(cli, cfg.CacheDir)
	default:
		return nil, fmt.Errorf("unknown backend %q", cfg.Backend)
	}
}
