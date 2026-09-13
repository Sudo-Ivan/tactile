// Package client is a Go client for the tactile-publish REST API, used by
// publishctl and a reference for the app-side publisher. It mirrors the
// relay's auth scheme: Ed25519 identity plus timestamped signatures.
package client

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Sudo-Ivan/tactile/publish/internal/identity"
	"github.com/Sudo-Ivan/tactile/publish/internal/protocol"
)

// Client talks to one publish node.
type Client struct {
	Endpoint string // base URL, e.g. http://localhost:8472
	priv     ed25519.PrivateKey
	pub      identity.PubKey
	http     *http.Client
}

// GenerateKey creates a new identity keypair.
func GenerateKey() (ed25519.PrivateKey, error) {
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	return priv, err
}

// New builds a client from a 64-byte Ed25519 private key.
func New(endpoint string, priv ed25519.PrivateKey) (*Client, error) {
	if len(priv) != ed25519.PrivateKeySize {
		return nil, errors.New("client: bad private key size")
	}
	c := &Client{
		Endpoint: strings.TrimRight(endpoint, "/"),
		priv:     priv,
		http:     &http.Client{Timeout: 60 * time.Second},
	}
	copy(c.pub[:], priv.Public().(ed25519.PublicKey))
	return c, nil
}

// LoadOrCreateKey reads a hex private-key file, generating one if absent.
func LoadOrCreateKey(path string) (ed25519.PrivateKey, error) {
	b, err := os.ReadFile(path) // #nosec G304 -- operator-supplied path
	if err == nil {
		raw, derr := hex.DecodeString(strings.TrimSpace(string(b)))
		if derr != nil || len(raw) != ed25519.PrivateKeySize {
			return nil, errors.New("client: bad key file")
		}
		return ed25519.PrivateKey(raw), nil
	}
	priv, err := GenerateKey()
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(path, []byte(hex.EncodeToString(priv)+"\n"), 0o600); err != nil {
		return nil, err
	}
	return priv, nil
}

// PubKey returns the client's public key.
func (c *Client) PubKey() identity.PubKey { return c.pub }

func (c *Client) sign(msg []byte) string {
	return base64.StdEncoding.EncodeToString(ed25519.Sign(c.priv, msg))
}

var ua = fmt.Sprintf("tactile-publishctl/%d", protocol.Version)

// signedReq builds a request with the timestamped signature headers.
func (c *Client) signedReq(method, url string, body io.Reader, msgFor func(ts int64) []byte) (*http.Request, error) {
	ts := time.Now().Unix()
	sig := c.sign(msgFor(ts))
	req, err := http.NewRequest(method, c.Endpoint+url, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Tactile-Identity", base64.StdEncoding.EncodeToString(c.pub[:]))
	req.Header.Set("X-Tactile-Timestamp", fmt.Sprintf("%d", ts))
	req.Header.Set("X-Tactile-Signature", sig)
	req.Header.Set("User-Agent", ua)
	return req, nil
}

func (c *Client) do(req *http.Request) ([]byte, int, error) {
	res, err := c.http.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = res.Body.Close() }()
	b, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return nil, res.StatusCode, err
	}
	if res.StatusCode >= 400 {
		var e struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		}
		if json.Unmarshal(b, &e) == nil && e.Code != "" {
			return b, res.StatusCode, fmt.Errorf("%s: %s", e.Code, e.Message)
		}
		return b, res.StatusCode, fmt.Errorf("http %d", res.StatusCode)
	}
	return b, res.StatusCode, nil
}

// Info fetches node metadata.
func (c *Client) Info() (map[string]any, error) {
	b, _, err := c.do0("GET", "/v1/info")
	var m map[string]any
	if err == nil {
		err = json.Unmarshal(b, &m)
	}
	return m, err
}

func (c *Client) do0(method, path string) ([]byte, int, error) {
	req, err := http.NewRequest(method, c.Endpoint+path, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", ua)
	return c.do(req)
}

// CreateSite claims slug. When the node advertises pow_bits > 0 this mines
// a nonce against the stateless challenge first.
func (c *Client) CreateSite(slug, title string) (map[string]any, error) {
	var nonce string
	if info, err := c.Info(); err == nil {
		if bits, _ := info["pow_bits"].(float64); bits > 0 {
			n, err := c.minePoW()
			if err != nil {
				return nil, err
			}
			nonce = n
		}
	}
	body, _ := json.Marshal(map[string]string{"title": title})
	req, err := c.signedReq("PUT", "/v1/sites/"+slug, bytes.NewReader(body),
		func(ts int64) []byte { return protocol.SiteSigMessage(slug, ts) })
	if err != nil {
		return nil, err
	}
	if nonce != "" {
		req.Header.Set("X-Tactile-Pow-Nonce", nonce)
	}
	b, _, err := c.do(req)
	var m map[string]any
	if err == nil {
		err = json.Unmarshal(b, &m)
	}
	return m, err
}

// minePoW fetches the challenge and grinds a nonce.
func (c *Client) minePoW() (string, error) {
	b, _, err := c.do0("GET", "/v1/challenge")
	if err != nil {
		return "", err
	}
	var ch struct {
		Challenge string  `json:"challenge"`
		PowBits   float64 `json:"pow_bits"`
	}
	if err := json.Unmarshal(b, &ch); err != nil {
		return "", err
	}
	challenge, err := base64.StdEncoding.DecodeString(ch.Challenge)
	if err != nil {
		return "", err
	}
	bits := int(ch.PowBits)
	var nonce [16]byte
	for {
		if _, err := rand.Read(nonce[:]); err != nil {
			return "", err
		}
		if identity.CheckPoW(challenge, c.pub, nonce[:], bits) {
			return base64.StdEncoding.EncodeToString(nonce[:]), nil
		}
	}
}

// ListSites returns the caller's sites.
func (c *Client) ListSites() (map[string]any, error) {
	req, err := c.signedReq("GET", "/v1/sites", nil,
		func(ts int64) []byte { return protocol.RESTSigMessage("LIST", "", ts) })
	if err != nil {
		return nil, err
	}
	b, _, err := c.do(req)
	var m map[string]any
	if err == nil {
		err = json.Unmarshal(b, &m)
	}
	return m, err
}

// DeleteSite removes a site.
func (c *Client) DeleteSite(slug string) error {
	req, err := c.signedReq("DELETE", "/v1/sites/"+slug, nil,
		func(ts int64) []byte { return protocol.DelSigMessage(slug, ts) })
	if err != nil {
		return err
	}
	_, _, err = c.do(req)
	return err
}

// Deploy uploads a raw tar or tar.gz bundle to slug.
func (c *Client) Deploy(slug string, bundleBytes []byte) (map[string]any, error) {
	sum := sha256.Sum256(bundleBytes)
	req, err := c.signedReq("POST", "/v1/sites/"+slug+"/deploys", bytes.NewReader(bundleBytes),
		func(ts int64) []byte { return protocol.DeploySigMessage(slug, sum, ts) })
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-tar")
	b, _, err := c.do(req)
	var m map[string]any
	if err == nil {
		err = json.Unmarshal(b, &m)
	}
	return m, err
}

// DeployDir tars a local directory and deploys it.
func (c *Client) DeployDir(slug, dir string) (map[string]any, error) {
	b, err := BuildTarGz(dir)
	if err != nil {
		return nil, err
	}
	return c.Deploy(slug, b)
}

// BuildTarGz packs dir into a gzipped tar suitable for Deploy.
// publish.json at the root is included; the server consumes it.
func BuildTarGz(dir string) ([]byte, error) {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	err := filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(dir, p)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if d.IsDir() {
			return tw.WriteHeader(&tar.Header{Name: rel, Typeflag: tar.TypeDir, Mode: 0o755})
		}
		if !d.Type().IsRegular() {
			return fmt.Errorf("client: %s is not a regular file", rel)
		}
		data, err := os.ReadFile(p) // #nosec G304 -- walk of operator dir
		if err != nil {
			return err
		}
		if err := tw.WriteHeader(&tar.Header{
			Name: rel, Typeflag: tar.TypeReg, Mode: 0o644, Size: int64(len(data)),
		}); err != nil {
			return err
		}
		_, err = tw.Write(data)
		return err
	})
	if err != nil {
		return nil, err
	}
	if err := tw.Close(); err != nil {
		return nil, err
	}
	if err := gz.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ListDeploys lists a site's retained deploys.
func (c *Client) ListDeploys(slug string) (map[string]any, error) {
	req, err := c.signedReq("GET", "/v1/sites/"+slug+"/deploys", nil,
		func(ts int64) []byte { return protocol.RESTSigMessage("DEPLOYS", slug, ts) })
	if err != nil {
		return nil, err
	}
	b, _, err := c.do(req)
	var m map[string]any
	if err == nil {
		err = json.Unmarshal(b, &m)
	}
	return m, err
}

// Rollback flips a site back to a retained deploy.
func (c *Client) Rollback(slug, deployID string) (map[string]any, error) {
	body, _ := json.Marshal(map[string]string{"deploy_id": deployID})
	req, err := c.signedReq("POST", "/v1/sites/"+slug+"/rollback", bytes.NewReader(body),
		func(ts int64) []byte { return protocol.RESTSigMessage("ROLLBACK", slug+"|"+deployID, ts) })
	if err != nil {
		return nil, err
	}
	b, _, err := c.do(req)
	var m map[string]any
	if err == nil {
		err = json.Unmarshal(b, &m)
	}
	return m, err
}

// AddDomain attaches a custom domain and returns the TXT proof to publish.
func (c *Client) AddDomain(slug, domain string) (map[string]any, error) {
	body, _ := json.Marshal(map[string]string{"domain": domain})
	req, err := c.signedReq("POST", "/v1/sites/"+slug+"/domains", bytes.NewReader(body),
		func(ts int64) []byte { return protocol.RESTSigMessage("DOMAIN", slug+"|"+domain, ts) })
	if err != nil {
		return nil, err
	}
	b, _, err := c.do(req)
	var m map[string]any
	if err == nil {
		err = json.Unmarshal(b, &m)
	}
	return m, err
}

// VerifyDomain asks the node to check the TXT proof and activate.
func (c *Client) VerifyDomain(slug, domain string) (map[string]any, error) {
	body, _ := json.Marshal(map[string]string{"domain": domain})
	req, err := c.signedReq("POST", "/v1/sites/"+slug+"/domains/verify", bytes.NewReader(body),
		func(ts int64) []byte { return protocol.RESTSigMessage("DOMAIN_VERIFY", slug+"|"+domain, ts) })
	if err != nil {
		return nil, err
	}
	b, _, err := c.do(req)
	var m map[string]any
	if err == nil {
		err = json.Unmarshal(b, &m)
	}
	return m, err
}

// DeleteDomain detaches a custom domain.
func (c *Client) DeleteDomain(slug, domain string) error {
	req, err := c.signedReq("DELETE", "/v1/sites/"+slug+"/domains/"+domain, nil,
		func(ts int64) []byte { return protocol.RESTSigMessage("DOMAIN_DEL", slug+"|"+domain, ts) })
	if err != nil {
		return err
	}
	_, _, err = c.do(req)
	return err
}

// Usage returns the caller's deduplicated usage and limits.
func (c *Client) Usage() (map[string]any, error) {
	req, err := c.signedReq("GET", "/v1/usage", nil,
		func(ts int64) []byte { return protocol.RESTSigMessage("USAGE", "", ts) })
	if err != nil {
		return nil, err
	}
	b, _, err := c.do(req)
	var m map[string]any
	if err == nil {
		err = json.Unmarshal(b, &m)
	}
	return m, err
}
