# Tactile Relay

Blind store-and-forward relay for Tactile sync. Stores signed, encrypted
blobs it cannot read. No accounts, no emails, no user database.

## Run

```bash
make build
./bin/relay -addr :8471 -data ./relay-data
```

`relay -v` prints version and build info, `relay -h` lists flags. Every
flag has a `TACTILE_RELAY_*` env override.

## Notes

- Devices authenticate with Ed25519 keys and proof of work, not accounts.
- Blobs are signed ciphertext with a negotiated TTL; expired blobs are
  deleted.
- WebSocket for live events and WebRTC signaling, REST as fallback.
- Storage backend is the filesystem by default, or S3-compatible object
  storage (`-backend s3`).
- Clients can use several relays at once. No federation: relays are
  independent and interchangeable.
- Optional paid tiers via stateless HMAC tokens (`-token-secrets`,
  `-mint`). Off by default. See `-h` and the tier table in
  `internal/tier/tier.go`.
- Optional User-Agent whitelist (`-ua-whitelist`) and trusted-proxy
  support (`-trusted-proxies`) for deployments behind a load balancer.

## Develop

```bash
make test   # unit, adversarial, oracle tests
make race   # with -race
make fuzz   # fuzz targets
make lint   # golangci-lint
make gosec  # security scan
```

## License

Same as the Tactile monorepo, AGPLv3.
