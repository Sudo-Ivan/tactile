// Command relay runs a Tactile sync relay: a blind store-and-forward node
// for end-to-end encrypted blobs.
package main

import (
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/Sudo-Ivan/tactile/relay/internal/config"
	"github.com/Sudo-Ivan/tactile/relay/internal/s3client"
	"github.com/Sudo-Ivan/tactile/relay/internal/server"
	"github.com/Sudo-Ivan/tactile/relay/internal/store"
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
	fs := flag.NewFlagSet("relay", flag.ExitOnError)
	cfg.Flags(fs)
	var showVersion bool
	var healthCheck bool
	fs.BoolVar(&showVersion, "v", false, "print version and exit")
	fs.BoolVar(&showVersion, "version", false, "print version and exit")
	fs.BoolVar(&healthCheck, "healthcheck", false,
		"probe the health endpoint on -addr and exit nonzero on failure")
	fs.Usage = func() {
		_, _ = fmt.Fprintf(fs.Output(), `tactile-relay %s (commit %s, built %s)

Blind E2EE sync relay for Tactile. Stores signed ciphertext blobs for a
negotiated TTL and fans out live events over WebSocket.

Usage: relay [flags]

Every flag has an environment override named %s<FLAG_NAME>,
e.g. -addr -> %sADDR. Explicit flags win over the environment.

Flags:
`, version, commit, date, config.EnvPrefix, config.EnvPrefix)
		fs.PrintDefaults()
	}
	_ = fs.Parse(os.Args[1:])

	if showVersion {
		fmt.Printf("tactile-relay %s\ncommit %s\nbuilt  %s\n", version, commit, date)
		return
	}
	if err := config.ApplyEnv(fs); err != nil {
		fatal("env config", err)
	}
	if healthCheck {
		os.Exit(probeHealth(cfg.Addr))
	}

	st, err := openBackend(cfg)
	if err != nil {
		fatal("open store", err)
	}
	srv, err := server.New(cfg, st)
	if err != nil {
		fatal("server", err)
	}

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		_ = srv.Close()
	}()

	slog.Info("relay listening", "relay_id", srv.RelayID(), "addr", cfg.Addr, "backend", cfg.Backend)
	if err := srv.ListenAndServe(); err != nil {
		fatal("serve", err)
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

// fatal logs msg (with err when non-nil) and exits nonzero, like
// log.Fatal did.
func fatal(msg string, err error) {
	if err != nil {
		slog.Error(msg, "err", err)
	} else {
		slog.Error(msg)
	}
	os.Exit(1)
}

func openBackend(cfg config.Config) (store.Backend, error) {
	switch cfg.Backend {
	case "fs", "":
		return store.OpenFS(cfg.DataDir, cfg.MaxBlobSize)
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
		return store.NewS3(cli, cfg.MaxBlobSize)
	default:
		return nil, fmt.Errorf("unknown backend %q", cfg.Backend)
	}
}
