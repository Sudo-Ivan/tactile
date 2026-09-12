# Tactile

Local-first, privacy-focused markdown notes. Minimal, lightweight and fast.

Tactile is a fork of [haptic](https://github.com/chroxify/haptic) by chroxify

## Features

- Markdown notes with a TipTap-based editor
- Local-first: notes stay on your machine
- Desktop app built with Tauri, web app stores notes as files in OPFS
- Command menu, daily notes and tasks
- Dark mode
- No third-party trackers or hosted backends required

## Install

Download desktop builds from the [releases](https://github.com/Sudo-Ivan/tactile/releases) page.

Run the web app with Docker:

```bash
docker pull ghcr.io/sudo-ivan/tactile-web:latest
docker run -d -p 3000:80 ghcr.io/sudo-ivan/tactile-web:latest
```

## Build from source

Requires Node.js 22+, pnpm 11 and a Rust toolchain for the desktop app.

```bash
git clone https://github.com/Sudo-Ivan/tactile.git
cd tactile
pnpm install
```

Run everything in dev mode:

```bash
pnpm dev
```

Or per app:

```bash
pnpm --filter web dev          # web app
pnpm --filter homepage dev     # homepage
pnpm --filter desktop dev:tauri  # desktop app (needs Rust + webkit deps)
```

Build:

```bash
pnpm build
```

## License

GNU Affero General Public License v3, see [LICENSE](LICENSE). Original work copyright chroxify and haptic contributors.
