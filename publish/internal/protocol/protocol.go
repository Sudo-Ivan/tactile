// Package protocol defines the publish REST protocol: error codes,
// signature domain separators, and the signed-message layouts every write
// request must satisfy. Published content is public; signatures only gate
// writes.
package protocol

import (
	"strconv"
)

// Version is the protocol version implemented by this package.
const Version = 1

// Error codes returned in Error.Code.
const (
	CodeBadRequest    = "bad_request"
	CodeUnauth        = "unauthenticated"
	CodeBadSig        = "bad_signature"
	CodeBadPoW        = "bad_pow"
	CodeNotFound      = "not_found"
	CodeConflict      = "conflict"
	CodeTooLarge      = "too_large"
	CodeQuotaExceeded = "quota_exceeded"
	CodeStorageFull   = "storage_full"
	CodeRateLimited   = "rate_limited"
	CodeBadToken      = "bad_token"
	CodeForbiddenUA   = "forbidden"
	CodeBadBundle     = "bad_bundle"
	CodeBadDomain     = "bad_domain"
	CodeReadOnly      = "read_only"
	CodeInternal      = "internal"
)

// Signature domain separators. Every signature covers a domain prefix so a
// signature produced for one purpose can never be replayed for another.
var (
	DomainSite   = []byte("tactile-publish/site/v1")
	DomainDeploy = []byte("tactile-publish/deploy/v1")
	DomainDel    = []byte("tactile-publish/del/v1")
	DomainREST   = []byte("tactile-publish/rest/v1")
	// DomainVerify is not a signature domain: it scopes the HMAC DNS TXT
	// verification tokens the node mints for custom-domain checks.
	DomainVerify = []byte("tactile-publish/verify/v1")
	// DomainPoW scopes the stateless proof-of-work challenges.
	DomainPoW = []byte("tactile-publish/pow/v1")
)

// SiteSigMessage is signed to create or update a site:
// DomainSite || slug || timestamp.
func SiteSigMessage(slug string, ts int64) []byte {
	msg := make([]byte, 0, len(DomainSite)+len(slug)+20)
	msg = append(msg, DomainSite...)
	msg = append(msg, slug...)
	return strconv.AppendInt(msg, ts, 10)
}

// DeploySigMessage is signed to upload a deploy bundle:
// DomainDeploy || slug || sha256(bundle) || timestamp.
func DeploySigMessage(slug string, sum [32]byte, ts int64) []byte {
	msg := make([]byte, 0, len(DomainDeploy)+len(slug)+32+20)
	msg = append(msg, DomainDeploy...)
	msg = append(msg, slug...)
	msg = append(msg, sum[:]...)
	return strconv.AppendInt(msg, ts, 10)
}

// DelSigMessage is signed to delete a site:
// DomainDel || slug || timestamp.
func DelSigMessage(slug string, ts int64) []byte {
	msg := make([]byte, 0, len(DomainDel)+len(slug)+20)
	msg = append(msg, DomainDel...)
	msg = append(msg, slug...)
	return strconv.AppendInt(msg, ts, 10)
}

// RESTSigMessage is signed for misc authenticated calls:
// DomainREST || method || subject || timestamp.
func RESTSigMessage(method, subject string, ts int64) []byte {
	msg := make([]byte, 0, len(DomainREST)+len(method)+len(subject)+20)
	msg = append(msg, DomainREST...)
	msg = append(msg, method...)
	msg = append(msg, subject...)
	return strconv.AppendInt(msg, ts, 10)
}
