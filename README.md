<!-- Header -->
<div align="center" style="margin-top: 120px">
  <a href="https://github.com/Sudo-Ivan/tactile/app">
    <img
      src="./.github/assets/icon.svg"
      alt="Tactile"
      height="100"
    />
  </a>

  <h3 align="center">Tactile
  </h3>
  <b>
    Open-Source markdown editor - your new home for notes
  </b>
</div>

<!-- TOC -->
<p align="center">
    <a href="https://github.com/Sudo-Ivan/tactile"><strong>Learn more »</strong></a>
    <br />
    <br />
    <a href="https://github.com/Sudo-Ivan/tactile/tree/main#introduction">Introduction</a>
    ·
    <a href="https://github.com/Sudo-Ivan/tactile/tree/main#tech-stack">Tech Stack</a>
    ·
    <a href="https://github.com/Sudo-Ivan/tactile/tree/main#deploy-your-own">Deploy Your Own</a>
    ·
    <a href="https://github.com/Sudo-Ivan/tactile/tree/main#roadmap">Roadmap</a>
    ·
    <a href="https://github.com/Sudo-Ivan/tactile/tree/main#contributing">Contributing</a>
  </p>
</p>

<p>
    <a href="https://github.com/Sudo-Ivan/tactile/app">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="./.github/assets/tactile-dark.png">
        <source media="(prefers-color-scheme: light)" srcset="./.github/assets/tactile-light.png">
        <img alt="Tactile" src="./.github/assets/tactile-dark.png">
      </picture>
    </a>
</p>

## Introduction

Tactile is a new local-first & privacy-focused, open-source home for your markdown notes. It's minimal, lightweight, efficient and aims to have _all you need and nothing you don't_.

If you'd like to learn more about Tactile, why it's being built, what its goals are and how it differs from all the other markdown editors out there, you can read more about it [here](https://github.com/Sudo-Ivan/tactile/app).

## Tech Stack

- [Tauri](https://tauri.app/) – Desktop App
- [PGlite](https://pglite.dev/) – Local Database
- [Svelte](https://kit.svelte.dev/) – Framework
- [Tailwind](https://tailwindcss.com/) – CSS
- [Shadcn/ui](https://www.shadcn-svelte.com/) – Component Library
- [Vercel](https://vercel.com/) – Hosting

## Deploy Your Own

If you're interested in self-hosting your own web instance of Tactile, you can do so with these two options:

### Vercel

You can one-click deploy your own instance of Tactile on Vercel. Just click the button below and follow the instructions:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Sudo-Ivan/tactile&project-name=tactile-web&repository-name=tactile-web&root-directory=apps/web)

### Docker

1. Pull the image from the docker hub

```bash
docker pull Sudo-Ivan/tactile-web:latest
```

2. Run the container

```bash
docker run -d -p 3000:80 Sudo-Ivan/tactile-web:latest
```

3. Visit `http://localhost:3000` in your browser

## Roadmap

Tactile is currently still in active development. Here are some of the features planned for the future:

- [ ] Tactile Sync - Sync your notes across devices
- [ ] Note sharing - Share single notes or entire collections via link
- [ ] Mobile support for the web app - Currently dependent on PGlite support for mobile
- [ ] Native mobile apps for iOS & Android
- [ ] Windows & Linux support for the desktop app

and much much more, so stay tuned!

## Contributing

We would love to have your help in making tactile better!

Here's how you can contribute:

- [Report a bug](https://github.com/Sudo-Ivan/tactile/issues/new?labels=bug) you found while using Tactile
- [Request a feature](https://github.com/Sudo-Ivan/tactile/issues/new?labels=enhancement) that you think will be useful
- [Submit a pull request](https://github.com/Sudo-Ivan/tactile/pulls) if you want to contribute with new features or bug fixes

## License

Tactile is licensed under the [GNU Affero General Public License Version 3 (AGPLv3)](https://github.com/Sudo-Ivan/tactile/blob/main/LICENSE).

---
