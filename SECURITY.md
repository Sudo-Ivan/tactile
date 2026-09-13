# Security Policy

## Supported Versions

Security fixes are applied to the latest commit on `main` and ship in the
next release. Only the latest release receives security updates.

## Reporting a Vulnerability

Please do not report security vulnerabilities through public GitHub
issues.

Instead, report them privately through GitHub's private vulnerability
reporting:

https://github.com/Sudo-Ivan/tactile/security/advisories/new

You should receive an acknowledgement within a few days. If the issue is
confirmed, we will release a patch as soon as possible and credit you in
the advisory if you wish.

## Scope

Tactile consists of a web app, a Tauri desktop app, a Go relay server,
and a self-hosted publish stack. Relevant areas include:

- Remote content loaded or rendered by the editor (mermaid, KaTeX,
  attachments, markdown)
- The sync path between clients and the relay
- The publish node, its allowlist, and served content
- Tauri IPC boundaries in the desktop app
