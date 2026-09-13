# syntax=docker/dockerfile:1
# tactile-relay: multi-stage, rootless, fully pinned.
#
# Targets:
#   relay  - the Go relay on distroless nonroot (no shell, no package mgr)
#
# Build context is relay/ (one level up):
#   docker build -f docker/Dockerfile --target relay .

ARG GO_VERSION=1.27
# Base images are pinned by digest; bump deliberately.
ARG GO_IMAGE=golang:1.27-alpine@sha256:cf6fca6641884b8433441b2b0652976f975e1d0fdd26d177eaaf8596087f3125
ARG RUNTIME_IMAGE=gcr.io/distroless/static:nonroot@sha256:1c2c046bc09ed40fad370b599a0b1ae7987f55b01e247cf27a7c27cd97e5bbc7

# OCI metadata, overridable at build time.
ARG IMAGE_VERSION=dev
ARG IMAGE_REVISION=none
ARG IMAGE_CREATED=""
ARG IMAGE_TITLE="tactile-relay"
ARG IMAGE_DESCRIPTION="Blind E2EE sync relay for Tactile"
ARG IMAGE_SOURCE="https://github.com/Sudo-Ivan/tactile"
ARG IMAGE_LICENSES="AGPL-3.0-only"

# ------------------------------------------------------------------ relay
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
      -o /out/relay ./cmd/relay \
    && install -d -m 0700 /out/data

FROM ${RUNTIME_IMAGE} AS relay
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
COPY --from=build /out/relay /usr/bin/relay
COPY --from=build --chown=65532:65532 /out/data /data
USER 65532:65532
ENV TACTILE_RELAY_ADDR=:8471 \
    TACTILE_RELAY_DATA=/data
EXPOSE 8471
VOLUME ["/data"]
ENTRYPOINT ["/usr/bin/relay"]
