.PHONY: all build test race vet lint gosec fuzz fmt clean docker

VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
COMMIT  := $(shell git rev-parse --short HEAD 2>/dev/null || echo none)
DATE    := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS := -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.date=$(DATE)

all: fmt vet lint test build

build:
	go build -ldflags "$(LDFLAGS)" -o bin/publish ./cmd/publish
	go build -o bin/publishctl ./cmd/publishctl

test:
	go test ./...

race:
	go test -race ./...

vet:
	go vet ./...

lint:
	golangci-lint run ./...

gosec:
	gosec -quiet ./...

fmt:
	gofumpt -w .
	gofmt -w .

docker:
	docker build -f docker/Dockerfile --target publish -t tactile-publish:$(VERSION) ..
	docker build -f docker/Dockerfile --target caddy -t tactile-publish-caddy:$(VERSION) ..

clean:
	rm -rf bin
