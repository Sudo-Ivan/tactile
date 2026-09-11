# TODO

## Roadmap (carried over from haptic)

- [ ] Tactile Sync - sync notes across devices
- [ ] Note sharing - share single notes or collections via link
- [ ] Mobile support for the web app - depends on PGlite mobile support
- [ ] Native mobile apps for iOS and Android
- [ ] Windows and Linux builds for the desktop app

## Migration follow-ups

- [ ] Finish Svelte 5 runes port in apps (desktop, web, homepage still use some legacy syntax)
- [ ] Fix svelte/no-navigation-without-resolve eslint errors (use $app/paths resolve())
- [ ] Verify bits-ui 2 component API surface matches what the apps expect
- [ ] Verify Tauri v2 migration end to end (tauri dev/build on macOS and Linux)
- [ ] Re-check macOS window theming after objc2 port in src-tauri
- [ ] Test the updater flow against GitHub releases latest.json
- [ ] Confirm tiptap-markdown 0.9 works with TipTap v3 or vendor/replace it
- [ ] Evaluate replacing remaining cmdk-style Command usage with bits-ui Command in apps
- [ ] Replace radix-icons-svelte remnants if any remain

## Infrastructure

- [ ] Set up GHCR publishing for the web Docker image
- [ ] Rotate signing secrets for this fork: TAURI_SIGNING_PRIVATE_KEY, TAURI_SIGNING_PRIVATE_KEY_PASSWORD, APPLE_* secrets (release.yml expects these names)
- [ ] Verify the v2 updater pubkey in tauri.conf.json matches the new TAURI_SIGNING_PRIVATE_KEY
- [ ] Pick a real domain/host for the homepage and update og:url, redirects.ts, updater endpoint
- [ ] Add unit tests (vitest) and e2e tests (playwright)
- [ ] Evaluate TypeScript 7 once typescript-eslint and svelte-check support it
- [ ] Evaluate ESLint 10 rule changes and tighten the shared config
- [ ] Add renovate or dependabot config for pnpm + cargo updates
