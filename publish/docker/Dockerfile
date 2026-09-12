# syntax=docker/dockerfile:1
# tactile-publish: multi-stage, rootless, fully pinned.
#
# Targets:
#   publish  - the Go node on distroless nonroot (no shell, no package mgr)
#   caddy    - Caddy rebuilt with DNS-01 plugins for wildcard/custom-domain
#              TLS, running as a non-root user on high ports
#
# Build context is publish/ (one level up):
#   docker build -f docker/Dockerfile --target publish .
#   docker build -f docker/Dockerfile --target caddy .

ARG GO_VERSION=1.27
ARG CADDY_VERSION=2.10.2
# Base images are pinned by digest; bump deliberately.
ARG GO_IMAGE=golang:1.27-alpine@sha256:cf6fca6641884b8433441b2b0652976f975e1d0fdd26d177eaaf8596087f3125
ARG CADDY_BUILDER_IMAGE=caddy:2.10.2-builder@sha256:01668408cc26e2e00c9d067c30cb43b2ba14ad1f2808beda55503cb2a31f59dc
ARG CADDY_RUNTIME_IMAGE=caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d
ARG RUNTIME_IMAGE=gcr.io/distroless/static:nonroot@sha256:1c2c046bc09ed40fad370b599a0b1ae7987f55b01e247cf27a7c27cd97e5bbc7

# OCI metadata, overridable at build time.
ARG IMAGE_VERSION=dev
ARG IMAGE_REVISION=none
ARG IMAGE_CREATED=""
ARG IMAGE_TITLE="tactile-publish"
ARG IMAGE_DESCRIPTION="Self-hostable static publishing node for Tactile (Obsidian Publish alternative)"
ARG IMAGE_SOURCE="https://github.com/Sudo-Ivan/tactile"
ARG IMAGE_LICENSES="AGPL-3.0-only"

# ---------------------------------------------------------------- publish
FROM --platform=$BUILDPLATFORM ${GO_IMAGE} AS build
ARG TARGETOS TARGETARCH
ARG IMAGE_VERSION
ARG IMAGE_REVISION
ARG IMAGE_CREATED
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build \
      -trimpath -buildvcs=false \
      -ldflags "-s -w -X main.version=${IMAGE_VERSION} -X main.commit=${IMAGE_REVISION} -X main.date=${IMAGE_CREATED}" \
      -o /out/publish ./cmd/publish \
    && install -d -m 0700 /out/data

FROM ${RUNTIME_IMAGE} AS publish
ARG IMAGE_VERSION
ARG IMAGE_REVISION
ARG IMAGE_CREATED
ARG IMAGE_TITLE
ARG IMAGE_DESCRIPTION
ARG IMAGE_SOURCE
ARG IMAGE_LICENSES
LABEL org.opencontainers.image.title="${IMAGE_TITLE}" \
      org.opencontainers.image.description="${IMAGE_DESCRIPTION}" \
      org.opencontainers.image.source="${IMAGE_SOURCE}" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${IMAGE_REVISION}" \
      org.opencontainers.image.created="${IMAGE_CREATED}" \
      org.opencontainers.image.licenses="${IMAGE_LICENSES}"
COPY --from=build /out/publish /usr/bin/publish
COPY --from=build --chown=65532:65532 /out/data /data
USER 65532:65532
ENV TACTILE_PUBLISH_ADDR=:8472 \
    TACTILE_PUBLISH_ADMIN_ADDR=:8473 \
    TACTILE_PUBLISH_DATA=/data
EXPOSE 8472 8473
VOLUME ["/data"]
ENTRYPOINT ["/usr/bin/publish"]

# ------------------------------------------------------------------ caddy
# Rebuild Caddy with the requested DNS-01 provider plugins so certificates
# (including wildcards) can be issued without inbound 80/443.
FROM ${CADDY_BUILDER_IMAGE} AS caddy-build
ARG CADDY_VERSION
# Space-separated plugin modules, e.g. "github.com/caddy-dns/cloudflare
# github.com/caddy-dns/route53". Empty builds stock Caddy.
ARG DNS_PLUGINS="github.com/caddy-dns/cloudflare"
RUN set -eu; \
    args=""; \
    for p in ${DNS_PLUGINS}; do args="${args} --with ${p}"; done; \
    xcaddy build "v${CADDY_VERSION}" --output /usr/bin/caddy ${args}

FROM ${CADDY_RUNTIME_IMAGE} AS caddy
ARG IMAGE_VERSION
ARG IMAGE_REVISION
ARG IMAGE_CREATED
ARG IMAGE_TITLE
ARG IMAGE_DESCRIPTION
ARG IMAGE_SOURCE
ARG IMAGE_LICENSES
LABEL org.opencontainers.image.title="${IMAGE_TITLE}-caddy" \
      org.opencontainers.image.description="${IMAGE_DESCRIPTION} - TLS edge" \
      org.opencontainers.image.source="${IMAGE_SOURCE}" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${IMAGE_REVISION}" \
      org.opencontainers.image.created="${IMAGE_CREATED}" \
      org.opencontainers.image.licenses="${IMAGE_LICENSES}"
COPY --from=caddy-build /usr/bin/caddy /usr/bin/caddy
COPY docker/Caddyfile /etc/caddy/Caddyfile
# Rootless: dedicated user, state dirs owned, and the Caddyfile binds only
# unprivileged ports (HTTP_PORT/HTTPS_PORT env, default 8080/8443). Map to
# real 80/443 at the edge or via published ports when you can open them.
RUN adduser -D -H -u 1000 caddy \
    && mkdir -p /config /data /etc/caddy \
    && chown -R 1000:1000 /config /data /etc/caddy
USER 1000:1000
ENV HOME=/data \
    XDG_CONFIG_HOME=/config \
    XDG_DATA_HOME=/data
EXPOSE 8080 8443
VOLUME ["/config", "/data"]
ENTRYPOINT ["caddy"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
