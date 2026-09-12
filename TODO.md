# TODO

## Roadmap (carried over from haptic)

- [ ] Tactile Sync - sync notes across devices (relay v1 in `relay/`: blind E2EE blob relay, WS live events, WebRTC signaling)
- [ ] CRDT-based merge + live collaboration for sync (Automerge/yrs; revisit after relay v1 ships)
- [ ] Note sharing - share single notes or collections via link (publish node in `publish/`: signed tar deploys, {slug}.base-domain + custom domains, s3 HA backend, paid tiers; client-side render + upload still needed app-side)
- [ ] Mobile support for the web app - storage now uses OPFS which works on mobile browsers
- [ ] Native mobile apps for iOS and Android
- [ ] Windows and Linux builds for the desktop app

## Migration follow-ups

- [ ] Fix svelte/no-navigation-without-resolve eslint warnings (use $app/paths resolve())
- [ ] Replace plain reactive Date usage with SvelteDate (prefer-svelte-reactivity warnings)
- [ ] Re-add transition props where the Svelte 5 port dropped them (tooltip, popover, dialog animations)
- [ ] Rewire editor auto_correct setting to the DOM (autocorrect attr is not valid on div, needs setAttribute)
- [ ] Verify bits-ui 2 component API surface matches what the apps expect
- [ ] Verify Tauri v2 migration end to end (tauri dev/build on macOS and Linux)
- [ ] Re-check macOS window theming after objc2 port in src-tauri
- [ ] Test the updater flow against GitHub releases latest.json
- [ ] Confirm tiptap-markdown 0.9 works with TipTap v3 or vendor/replace it
- [ ] Dedupe SearchAndReplace extension double export (named + default)
- [ ] Wire knip into CI once remaining findings are cleaned

## Infrastructure

- [ ] Set up GHCR publishing for the web Docker image
- [ ] Rotate signing secrets for this fork: TAURI_SIGNING_PRIVATE_KEY, TAURI_SIGNING_PRIVATE_KEY_PASSWORD, APPLE_* secrets (release.yml expects these names)
- [ ] Verify the v2 updater pubkey in tauri.conf.json matches the new TAURI_SIGNING_PRIVATE_KEY
- [ ] Pick a real domain/host for the homepage and update og:url, redirects.ts, updater endpoint
- [ ] Add unit tests (vitest) and e2e tests (playwright)
- [ ] Evaluate TypeScript 7 once typescript-eslint and svelte-check support it
- [ ] Evaluate ESLint 10 rule changes and tighten the shared config
- [ ] Add renovate or dependabot config for pnpm + cargo updates
