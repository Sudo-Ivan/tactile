# AGENTS.md

Guidance for agents and contributors working in this repository.

## Layout

- `apps/web` - SvelteKit web app (`web`), static SPA with a 404.html fallback
- `apps/homepage` - SvelteKit marketing and download site (`homepage`)
- `apps/desktop` - SvelteKit + Tauri desktop app (`desktop`, Rust in `src-tauri`)
- `packages/ui` - shared Svelte components (`@tactile/ui`)
- `packages/storage` - storage layer (`@tactile/storage`)
- `packages/config-eslint` - shared ESLint config (`@tactile/eslint-config`)
- `packages/config-tailwind` - shared Tailwind v4 theme (`@tactile/tailwind-config`)
- `relay` - Go websocket relay server (own Go module, not part of the pnpm workspace)
- `publish` - Go static publish node plus self-hosting stack
  (docker-compose, Caddy, Coolify), own Go module

## Toolchain

- Node >= 22, pnpm 11.24 (pinned via `packageManager`), turbo 2.x
- Install deps with `pnpm install` (frozen lockfile in CI)
- Go version comes from `relay/go.mod` / `publish/go.mod`

## Commands

Run from the repo root unless noted.

- `pnpm install` - install workspace dependencies
- `pnpm dev` - turbo dev for all apps
- `pnpm build` - turbo build (depends on `^build`)
- `pnpm lint` - turbo lint (prettier check + eslint per package)
- `pnpm check` - turbo check (svelte-kit sync + svelte-check in apps)
- `pnpm test` - turbo test (vitest in `apps/web` and `packages/ui`)
- `pnpm format` - prettier write across the repo
- `pnpm knip` - dead code and dependency report
- `pnpm screenshots` - regenerate README/homepage marketing screenshots with
  Playwright (`scripts/screenshots.mjs`); requires `pnpm build` first and
  `pnpm exec playwright install chromium` once

Filter to one package by name or directory:

- `pnpm --filter web build`
- `pnpm --filter homepage dev`
- `turbo run build --filter=desktop`

Per-app scripts (see each package.json): `dev`, `build`, `preview`,
`check`, `check:watch`, `lint`, `format`. `apps/web` and `packages/ui`
also have `test` (vitest). `apps/desktop` adds `dev:tauri` and `tauri`.

Packages without a script are skipped by turbo automatically.

## Relay (Go)

Run from `relay/`:

- `make build` - build `bin/relay` with version ldflags
- `make test` - `go test ./...`
- `make vet` - `go vet ./...`
- `make lint` - `golangci-lint run ./...`
- `make fmt` - gofumpt + gofmt
- `make race`, `make fuzz`, `make bench`, `make gosec` - extras

Config: every flag has a `TACTILE_RELAY_*` env equivalent, see
`relay/internal/config/config.go` and `relay/.env.example`.

## Publish (Go)

Run from `publish/`:

- `make build` - build `bin/publish` and `bin/publishctl`
- `make test` - `go test ./...`
- `make vet` - `go vet ./...`
- `make lint` - `golangci-lint run ./...`
- `make fmt` - gofumpt + gofmt
- `make docker` - build the publish and caddy images
- `make race`, `make gosec` - extras

Config: every flag has a `TACTILE_PUBLISH_*` env equivalent, see
`publish/internal/config/config.go` and `publish/docker/.env.example`.

Docker stacks live in `publish/docker/`: `docker-compose.yml` is the
subdomain stack (`{slug}.<domain>`) with a Caddy edge; `Caddyfile.dns`
adds DNS-01 wildcard certs; `Caddyfile.path` is the single-domain
subpath edge (`<domain>/s/{slug}/`). `docker-compose.coolify.yml` deploys
the node alone on Coolify in subpath mode. `relay/docker/` has the same
Coolify layout for the relay.

## Conventions

- Internal deps use the `workspace:*` protocol
- Shared third-party dependency versions live in the pnpm catalog in
  `pnpm-workspace.yaml` (`catalog:` specifiers), not in package.json
- Apps consume shared config via `@tactile/eslint-config` and
  `@tactile/tailwind-config` workspace packages
- Husky pre-commit runs `lint-staged`: prettier + eslint on staged
  `*.{svelte,js,ts}` files
- Env vars for SvelteKit apps use the `PUBLIC_` prefix; see each app's
  `.env.example`
- CI workflows pin actions by commit SHA with a version comment
- `knip.json` tracks dead code per workspace; run `pnpm knip` before
  removing exports or dependencies
