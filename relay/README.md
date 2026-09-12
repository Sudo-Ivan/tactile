# Tactile Relay

A blind sync relay for Tactile. It stores your encrypted notes for a while
and hands them to your other devices. It cannot read them, and it cannot
tell who you are.

## How it works

- Your identity is a key, not an account. The client derives an Ed25519
  keypair from a recovery phrase. No email, no signup, nothing to leak.
- Everything you send is signed ciphertext. The relay checks the
  signature, keeps the blob, and never sees plaintext.
- Blobs expire. You ask for a retention window, the relay clamps it to
  what it offers, and expired blobs get deleted.
- When your devices are online at once, the relay pushes change events
  over WebSocket and passes WebRTC signaling so they can sync directly.
- Anyone can run one. Run several. There is no federation: clients write
  to every relay they trust and read the union, so losing a relay costs
  nothing.

## Run it

```bash
make build
./bin/relay -addr :8471 -data ./relay-data
```

`relay -v` prints version, commit and build date. `relay -h` lists all
flags. Every flag also works as an env var: `TACTILE_RELAY_ADDR`,
`TACTILE_RELAY_MAX_STORAGE`, and so on.

### Storage backends

Default is the filesystem (`-data`). To use S3 or any compatible store
(MinIO, Garage, R2, B2):

```bash
./bin/relay -backend s3 \
  -s3-endpoint http://minio:9000 -s3-path-style \
  -s3-bucket tactile -s3-region auto \
  -s3-access-key ... -s3-secret-key ...
```

Blobs use the same on-disk envelope in both backends, so you can migrate
by copying files into the bucket layout.

### Behind a proxy

`-trusted-proxies 10.0.0.0/8` lets the relay trust `X-Forwarded-For` from
your load balancer for per-IP limits. Off by default.

### Health and load

- `GET /v1/health` — 200 ok, 503 when storage is full. Point your LB at it.
- `GET /v1/info` — capabilities plus live load (connections, storage %).
  Clients use this to pick the fastest, least busy relay.

## Abuse resistance

No accounts means no signup gate, so the relay defends itself:

- Proof of work to connect (`-pow-bits`, default 18)
- Per-IP connection rate and count limits
- Per-identity storage quota and a global storage cap
- Blob size and TTL bounds, message rate limits, bounded queues
- Optional User-Agent whitelist (`-ua-whitelist "Tactile/"`) keeps
  scrapers off the API; it is a gate, not auth — a determined client can
  spoof it. `/v1/info` and `/v1/health` stay open for monitoring.

## Paid tiers (optional, off by default)

Operators can charge for bigger limits without any user database. Tokens
are self-validating: the operator signs a tier name and expiry with an
HMAC secret, the relay verifies it on each write. Anyone can run a paid
relay with their own secret.

```bash
# enable paid mode (prefer the env var for the secret)
TACTILE_RELAY_TOKEN_SECRETS=changeme ./bin/relay ...

# mint a token for a customer, valid 365 days
./bin/relay -token-secrets changeme -mint pro -mint-days 365
```

Clients send the token in the `X-Tactile-Token` header (REST) or the auth
message (WebSocket). No token means the free tier; a bad or expired token
is rejected, not silently downgraded. Multiple comma-separated secrets let
you rotate without killing issued tokens.

Default tier table (override with `-tiers-file` JSON):

| tier      | quota   | max ttl | max blob |
| --------- | ------- | ------- | -------- |
| free      | 64 MiB  | 30 days | 1 MiB    |
| supporter | 256 MiB | 90 days | 4 MiB    |
| pro       | 1 GiB   | 1 year  | 8 MiB    |

Suggested starting prices (yours to change, it is just limits): supporter
$12/yr, pro $30/yr — under Obsidian and Joplin, and the relay stays blind
so you are selling capacity, not access to anything readable.

## Protocol in one paragraph

WebSocket `/v1/ws`: connect, get a challenge, answer with `auth` signed by
your key plus a PoW nonce, then `put`/`get`/`list`/`del`/`sub`/`signal`.
REST does the same over `/v1/blobs` with signed headers, and raw GETs
support `Range` for resumable fetches. Signatures are domain-separated so
nothing signed for one purpose works for another. Details are in
`internal/protocol/protocol.go`.

## Limits we measured

Single node, fs backend, 512B payloads on a desktop CPU:

- GET ~17.5k req/s, PUT ~12.4k req/s
- p99 under ~100ms at that load

Run your own numbers with `make bench` and `bin/relaybench -relays ...`.
A million req/s is not a thing this needs: it syncs notes, not feeds. If
you need more, run more relays — that is the point of no federation.

## Develop

```bash
make test   # unit, adversarial, oracle, mock-S3 tests
make race   # same under -race
make fuzz   # protocol, blob, store, PoW fuzzers
make lint   # golangci-lint
make gosec  # security scan
```
