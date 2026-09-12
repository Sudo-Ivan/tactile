// Package s3client is a minimal S3-compatible client using Signature
// Version 4 with unsigned payloads. It covers exactly what the publish
// S3 backend needs: PutObject, GetObject (optionally ranged), DeleteObject,
// and ListObjectsV2. Works with AWS S3 and compatible stores (MinIO,
// Garage, R2, B2) in path-style mode.
package s3client

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

const unsignedPayload = "UNSIGNED-PAYLOAD"

// Config describes an S3 endpoint.
type Config struct {
	Endpoint  string // e.g. https://s3.amazonaws.com or http://minio:9000
	Region    string // e.g. us-east-1; "auto" for R2
	Bucket    string
	AccessKey string
	SecretKey string
	PathStyle bool   // bucket/key in path; required by most non-AWS stores
	Prefix    string // optional key prefix, e.g. "tactile/"
}

// Client talks to one S3 bucket.
type Client struct {
	cfg  Config
	http *http.Client
}

// New builds a client.
func New(cfg Config) *Client {
	return &Client{
		cfg: cfg,
		http: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        128,
				MaxIdleConnsPerHost: 64,
				IdleConnTimeout:     90 * time.Second,
				TLSHandshakeTimeout: 10 * time.Second,
				ForceAttemptHTTP2:   true,
			},
		},
	}
}

// drain finishes a response body so the conn can be reused.
func drain(res *http.Response) {
	_, _ = io.Copy(io.Discard, res.Body)
	_ = res.Body.Close()
}

func (c *Client) keyURL(key string) (string, error) {
	base, err := url.Parse(c.cfg.Endpoint)
	if err != nil {
		return "", err
	}
	key = c.cfg.Prefix + key
	if c.cfg.PathStyle {
		base.Path = strings.TrimSuffix(base.Path, "/") + "/" + c.cfg.Bucket + "/" + key
	} else {
		base.Host = c.cfg.Bucket + "." + base.Host
		base.Path = strings.TrimSuffix(base.Path, "/") + "/" + key
	}
	return base.String(), nil
}

// PutObject stores body at key. Optional meta becomes x-amz-meta-* headers.
func (c *Client) PutObject(ctx context.Context, key string, body []byte, meta map[string]string) error {
	u, err := c.keyURL(key)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, u, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.ContentLength = int64(len(body))
	for k, v := range meta {
		req.Header.Set("x-amz-meta-"+k, v)
	}
	res, err := c.do(req)
	if err != nil {
		return err
	}
	defer drain(res)
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("s3 put %s: status %d", key, res.StatusCode)
	}
	return nil
}

// GetObject fetches an object. hdrRange, when non-empty, is a Range header
// value like "bytes=0-147". Returns body, total size (when known via
// Content-Range), and a not-found flag.
func (c *Client) GetObject(ctx context.Context, key, hdrRange string) ([]byte, int64, bool, error) {
	u, err := c.keyURL(key)
	if err != nil {
		return nil, 0, false, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, 0, false, err
	}
	if hdrRange != "" {
		req.Header.Set("Range", hdrRange)
	}
	res, err := c.do(req)
	if err != nil {
		return nil, 0, false, err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode == http.StatusNotFound || res.StatusCode == http.StatusGone {
		return nil, 0, true, nil
	}
	if res.StatusCode != http.StatusOK && res.StatusCode != http.StatusPartialContent {
		return nil, 0, false, fmt.Errorf("s3 get %s: status %d", key, res.StatusCode)
	}
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, 0, false, err
	}
	total := res.ContentLength
	if cr := res.Header.Get("Content-Range"); cr != "" {
		// Content-Range: bytes a-b/total
		if i := strings.LastIndex(cr, "/"); i >= 0 {
			var t int64
			if _, err := fmt.Sscanf(cr[i+1:], "%d", &t); err == nil {
				total = t
			}
		}
	}
	return body, total, false, nil
}

// HeadObject returns an object's size without fetching the body.
func (c *Client) HeadObject(ctx context.Context, key string) (int64, bool, error) {
	u, err := c.keyURL(key)
	if err != nil {
		return 0, false, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, u, nil)
	if err != nil {
		return 0, false, err
	}
	res, err := c.do(req)
	if err != nil {
		return 0, false, err
	}
	defer drain(res)
	if res.StatusCode == http.StatusNotFound {
		return 0, true, nil
	}
	if res.StatusCode != http.StatusOK {
		return 0, false, fmt.Errorf("s3 head %s: status %d", key, res.StatusCode)
	}
	return res.ContentLength, false, nil
}

// DeleteObject removes key. S3 delete is idempotent: absent keys still 204.
func (c *Client) DeleteObject(ctx context.Context, key string) error {
	u, err := c.keyURL(key)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, u, nil)
	if err != nil {
		return err
	}
	res, err := c.do(req)
	if err != nil {
		return err
	}
	defer drain(res)
	if res.StatusCode != http.StatusNoContent && res.StatusCode != http.StatusOK && res.StatusCode != http.StatusNotFound {
		return fmt.Errorf("s3 delete %s: status %d", key, res.StatusCode)
	}
	return nil
}

// Object is one listing entry.
type Object struct {
	Key  string
	Size int64
}

// ListObjects lists all keys under prefix, paginating ListObjectsV2.
func (c *Client) ListObjects(ctx context.Context, prefix string) ([]Object, error) {
	var out []Object
	var token string
	for {
		u, err := c.keyURL("")
		if err != nil {
			return nil, err
		}
		q := "?list-type=2&prefix=" + url.QueryEscape(c.cfg.Prefix+prefix)
		if token != "" {
			q += "&continuation-token=" + url.QueryEscape(token)
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u+q, nil)
		if err != nil {
			return nil, err
		}
		res, err := c.do(req)
		if err != nil {
			return nil, err
		}
		body, err := io.ReadAll(res.Body)
		_ = res.Body.Close()
		if err != nil {
			return nil, err
		}
		if res.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("s3 list: status %d: %s", res.StatusCode, truncate(body, 200))
		}
		keys, sizes, next, err := parseListResult(body)
		if err != nil {
			return nil, err
		}
		for i, k := range keys {
			out = append(out, Object{Key: strings.TrimPrefix(k, c.cfg.Prefix), Size: sizes[i]})
		}
		if next == "" {
			return out, nil
		}
		token = next
	}
}

func truncate(b []byte, n int) string {
	if len(b) > n {
		return string(b[:n])
	}
	return string(b)
}

// parseListResult extracts keys, sizes and the continuation token from a
// ListObjectsV2 XML response without pulling in a full XML model.
func parseListResult(body []byte) (keys []string, sizes []int64, next string, err error) {
	s := string(body)
	for _, seg := range strings.Split(s, "<Contents>") {
		if !strings.Contains(seg, "<Key>") {
			continue
		}
		key := xmlField(seg, "Key")
		var size int64
		if _, err := fmt.Sscanf(xmlField(seg, "Size"), "%d", &size); err != nil {
			continue
		}
		keys = append(keys, xmlUnescape(key))
		sizes = append(sizes, size)
	}
	if strings.Contains(s, "<IsTruncated>true</IsTruncated>") {
		next = xmlField(s, "NextContinuationToken")
		if next == "" && len(keys) > 0 {
			next = keys[len(keys)-1] // S3 spec: StartAfter last key
		}
		next = xmlUnescape(next)
	}
	return keys, sizes, next, nil
}

func xmlField(s, tag string) string {
	open := "<" + tag + ">"
	close := "</" + tag + ">"
	i := strings.Index(s, open)
	if i < 0 {
		return ""
	}
	j := strings.Index(s[i:], close)
	if j < 0 {
		return ""
	}
	return s[i+len(open) : i+j]
}

var xmlEsc = strings.NewReplacer("&lt;", "<", "&gt;", ">", "&amp;", "&", "&quot;", `"`, "&apos;", "'")

func xmlUnescape(s string) string { return xmlEsc.Replace(s) }

// do signs and sends the request.
func (c *Client) do(req *http.Request) (*http.Response, error) {
	c.sign(req)
	return c.http.Do(req)
}

// sign applies AWS Signature Version 4 with an unsigned payload.
func (c *Client) sign(req *http.Request) {
	now := time.Now().UTC()
	date := now.Format("20060102")
	amz := now.Format("20060102T150405Z")

	req.Header.Set("x-amz-date", amz)
	req.Header.Set("x-amz-content-sha256", unsignedPayload)
	req.Header.Set("Host", req.URL.Host)

	// Canonical request.
	var signedHeaders []string
	var canonHeaders strings.Builder
	headers := map[string]string{
		"host":                 req.URL.Host,
		"x-amz-content-sha256": unsignedPayload,
		"x-amz-date":           amz,
	}
	for k := range req.Header {
		lk := strings.ToLower(k)
		if strings.HasPrefix(lk, "x-amz-meta-") {
			headers[lk] = strings.Join(req.Header.Values(k), ",")
		}
	}
	keys := make([]string, 0, len(headers))
	for k := range headers {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		canonHeaders.WriteString(k + ":" + strings.TrimSpace(headers[k]) + "\n")
		signedHeaders = append(signedHeaders, k)
	}
	signed := strings.Join(signedHeaders, ";")

	canon := strings.Join([]string{
		req.Method,
		escapePath(req.URL.EscapedPath()),
		canonicalQuery(req.URL.Query()),
		canonHeaders.String(),
		signed,
		unsignedPayload,
	}, "\n")

	scope := date + "/" + c.cfg.Region + "/s3/aws4_request"
	toSign := "AWS4-HMAC-SHA256\n" + amz + "\n" + scope + "\n" + sha256hex(canon)

	kDate := hmacSHA256([]byte("AWS4"+c.cfg.SecretKey), date)
	kRegion := hmacSHA256(kDate, c.cfg.Region)
	kService := hmacSHA256(kRegion, "s3")
	kSigning := hmacSHA256(kService, "aws4_request")
	sig := hex.EncodeToString(hmacSHA256(kSigning, toSign))

	req.Header.Set("Authorization", "AWS4-HMAC-SHA256 Credential="+
		c.cfg.AccessKey+"/"+scope+", SignedHeaders="+signed+", Signature="+sig)
}

func escapePath(p string) string {
	// SigV4 wants each path segment URI-encoded, '/' unescaped, and no
	// double-encoding of an already-escaped path.
	u, err := url.PathUnescape(p)
	if err != nil {
		u = p
	}
	segs := strings.Split(u, "/")
	for i, s := range segs {
		segs[i] = url.PathEscape(s)
	}
	return strings.Join(segs, "/")
}

func canonicalQuery(q url.Values) string {
	var parts []string
	for k, vs := range q {
		for _, v := range vs {
			parts = append(parts, url.QueryEscape(k)+"="+url.QueryEscape(v))
		}
	}
	sort.Strings(parts)
	return strings.Join(parts, "&")
}

func hmacSHA256(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(data))
	return h.Sum(nil)
}

func sha256hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}
