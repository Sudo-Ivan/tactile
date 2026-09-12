.PHONY: all build test race vet lint gosec fuzz bench fmt clean

VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
COMMIT  := $(shell git rev-parse --short HEAD 2>/dev/null || echo none)
DATE    := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS := -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.date=$(DATE)

all: fmt vet lint test build

build:
	go build -ldflags "$(LDFLAGS)" -o bin/relay ./cmd/relay

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

fuzz:
	go test -fuzz=FuzzDecode -fuzztime=60s ./internal/protocol/
	go test -fuzz=FuzzUnmarshalHeader -fuzztime=60s ./internal/blob/
	go test -fuzz=FuzzRoundTrip -fuzztime=60s ./internal/store/
	go test -fuzz=FuzzLeadingZeroBits -fuzztime=30s ./internal/identity/

bench:
	go test -bench=. -benchmem ./internal/blob/

clean:
	rm -rf bin
