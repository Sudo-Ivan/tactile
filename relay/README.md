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
- Public by default; `-allow-public=false` restricts every authenticated
  operation to `-allowed-identities` (comma-separated hex public keys)
  for a private relay.
- Optional User-Agent whitelist (`-ua-whitelist`) and trusted-proxy
  support (`-trusted-proxies`) for deployments behind a load balancer.

## Docker

See `docker/`: a multi-stage, fully pinned, rootless Dockerfile builds a
distroless `relay` image. `docker-compose.coolify.yml` deploys the relay
on Coolify behind its own TLS proxy; set the service domain with the
internal port suffix (e.g. `https://relay.example.com:8471`).

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
