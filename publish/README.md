# Tactile Publish

Self-hostable static publishing node for Tactile: the Obsidian Publish
analog. Clients render notes to a static bundle, sign it with their
Ed25519 identity, and upload; the node serves it at
`{slug}.<base-domain>`, a verified custom domain, or `/s/{slug}/` paths.

## Run

```bash
make build
./bin/publish -addr :8472 -data ./publish-data -base-domain tactile.example
```

`publish -v` prints version and build info, `publish -h` lists flags.
Every flag has a `TACTILE_PUBLISH_*` env override.

## API

Writes are authorized by Ed25519 signatures over domain-separated
messages with a 2-minute timestamp window; reads of site content are
unauthenticated by design.

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /v1/info` | open | node info, limits, load, stats |
| `GET /v1/health` | open | LB probe, 503 when storage full |
| `GET /v1/challenge` | open | stateless PoW challenge for site claims |
| `PUT /v1/sites/{slug}` | sig+PoW | claim or update a site |
| `GET /v1/sites` | sig | list your sites |
| `GET /v1/sites/{slug}` | sig | site meta (owner only) |
| `DELETE /v1/sites/{slug}` | sig | remove site, deploys, domains |
| `POST /v1/sites/{slug}/deploys` | sig | upload tar/tar.gz bundle |
| `GET /v1/sites/{slug}/deploys` | sig | retained deploys |
| `POST /v1/sites/{slug}/rollback` | sig | flip current to an old deploy |
| `POST /v1/sites/{slug}/domains` | sig | attach domain, returns TXT proof |
| `POST /v1/sites/{slug}/domains/verify` | sig | check TXT, activate domain |
| `DELETE /v1/sites/{slug}/domains/{domain}` | sig | detach domain |
| `GET /v1/usage` | sig | deduplicated usage vs limits |

Site content: `GET/HEAD` on `{slug}.<base-domain>`, a verified custom
domain, or `/s/{slug}/...` on any host. Clean URLs (`/about` ->
`/about.html` or `/about/index.html`), site `404.html`, ETags, ranges,
and `publish.json` options (`entry`, `not_found`, `noindex`, `headers`)
are supported.

## Client

```bash
./bin/publishctl -server http://localhost:8473 -key ~/.config/tactile/publish.key \
    create myblog "My Blog"
./bin/publishctl deploy myblog ./dist
./bin/publishctl domain add myblog blog.example.com
# publish the printed TXT record, then:
./bin/publishctl domain verify myblog blog.example.com
```

## Storage model

Deploys are immutable manifests over content-addressed objects
(`objects/<sha256>`), so redeploys dedup automatically, rollback is a
pointer flip, and quota accounting is exact. Orphaned objects are reaped
by a two-pass sweeper.

## HA

With `-backend s3` every node is stateless over one shared bucket: run N
replicas behind any load balancer. The current-deploy pointer is cached
for `-manifest-ttl` (staleness bound), objects are immutable (safe disk
cache via `-cache-dir`), and the shared node key lives in the bucket so
PoW challenges and DNS tokens verify on every node. `-read-only` turns a
replica into a serving-only node. The fs backend is single-node unless
the data dir is on a shared volume.

## Paid tiers

`-token-secrets` enables stateless HMAC tier tokens (same scheme as the
sync relay). `-tiers-file` overrides the built-in free/supporter/pro
table. Mint with `publish -mint pro -token-secrets ...`.

## Docker

See `docker/`: a multi-stage, fully pinned, rootless Dockerfile builds a
distroless `publish` image and a `caddy` edge image compiled with DNS-01
plugins, plus a compose stack and an `.env.example`. Ports default to
8080/8443 so it runs unprivileged; use `Caddyfile.dns` for wildcard certs
with no inbound ports.

## License

Same as the Tactile monorepo, AGPLv3.
