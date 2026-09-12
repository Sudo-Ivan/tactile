// Package bundle parses deploy uploads: a tar stream, optionally gzip
// compressed, holding the static site plus an optional publish.json control
// file. Extraction enforces every size/count limit and rejects anything
// that is not a plain file or directory.
package bundle

import (
	"archive/tar"
	"bufio"
	"compress/gzip"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path"
	"strings"
)

// ManifestName is the reserved control file inside a bundle.
const ManifestName = "publish.json"

// Limits bound what Extract accepts.
type Limits struct {
	MaxFiles     int
	MaxFileBytes int64
	MaxSiteBytes int64 // total extracted bytes
}

// Options are site-level settings taken from publish.json.
type Options struct {
	Title    string            `json:"title"`
	Entry    string            `json:"entry"`     // index document, default /index.html
	NotFound string            `json:"not_found"` // 404 document, default /404.html
	NoIndex  bool              `json:"noindex"`   // send X-Robots-Tag: noindex
	Headers  map[string]string `json:"headers"`   // extra response headers on every served file
}

// File is one extracted regular file.
type File struct {
	Path string   // normalized, leading slash
	Hash [32]byte // sha256 of content
	Size int64
	MIME string
}

// Errors from Extract.
var (
	ErrBadPath   = errors.New("bundle: unsafe path")
	ErrTooMany   = errors.New("bundle: too many files")
	ErrFileBig   = errors.New("bundle: file too large")
	ErrSiteBig   = errors.New("bundle: extracted site too large")
	ErrBadBundle = errors.New("bundle: not a tar stream")
	ErrDupPath   = errors.New("bundle: duplicate path")
)

// Extract streams a tar (optionally gzipped) bundle from r, calling sink
// with each file's content after hashing. Sink may dedup on Hash. Returns
// the file list and parsed publish.json options. Extraction stops at the
// first violated limit; already-sunk objects become orphans and are
// reaped by the store sweeper.
func Extract(r io.Reader, lim Limits, sink func(f File, data []byte) error) ([]File, Options, error) {
	var opts Options
	br := bufio.NewReader(r)
	head, err := br.Peek(2)
	if err != nil && err != io.EOF {
		return nil, opts, ErrBadBundle
	}
	var tr *tar.Reader
	if len(head) == 2 && head[0] == 0x1f && head[1] == 0x8b {
		gz, err := gzip.NewReader(br)
		if err != nil {
			return nil, opts, ErrBadBundle
		}
		defer func() { _ = gz.Close() }()
		tr = tar.NewReader(gz)
	} else {
		tr = tar.NewReader(br)
	}

	var files []File
	var total int64
	seen := make(map[string]bool)
	var manifest []byte
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return files, opts, fmt.Errorf("%w: %v", ErrBadBundle, err)
		}
		switch hdr.Typeflag {
		case tar.TypeDir:
			continue
		case tar.TypeReg:
		default:
			// Reject symlinks, hardlinks, devices, fifos outright.
			return files, opts, fmt.Errorf("%w: %s (type %d)", ErrBadPath, hdr.Name, hdr.Typeflag)
		}
		p, err := cleanPath(hdr.Name)
		if err != nil {
			return files, opts, err
		}
		if seen[p] {
			return files, opts, fmt.Errorf("%w: %s", ErrDupPath, p)
		}
		seen[p] = true
		if hdr.Size > lim.MaxFileBytes {
			return files, opts, fmt.Errorf("%w: %s (%d bytes)", ErrFileBig, p, hdr.Size)
		}
		data, err := io.ReadAll(io.LimitReader(tr, lim.MaxFileBytes+1))
		if err != nil {
			return files, opts, err
		}
		if int64(len(data)) > lim.MaxFileBytes {
			return files, opts, fmt.Errorf("%w: %s", ErrFileBig, p)
		}
		total += int64(len(data))
		if total > lim.MaxSiteBytes {
			return files, opts, ErrSiteBig
		}
		if p == "/"+ManifestName {
			manifest = data
			continue
		}
		if len(files)+1 > lim.MaxFiles {
			return files, opts, ErrTooMany
		}
		f := File{
			Path: p,
			Hash: sha256.Sum256(data),
			Size: int64(len(data)),
			MIME: mimeOf(p, data),
		}
		if err := sink(f, data); err != nil {
			return files, opts, err
		}
		files = append(files, f)
	}
	if manifest != nil {
		if err := opts.parse(manifest); err != nil {
			return files, opts, fmt.Errorf("bundle: bad %s: %w", ManifestName, err)
		}
	}
	opts.normalize()
	return files, opts, nil
}

func (o *Options) parse(data []byte) error {
	return json.Unmarshal(data, o)
}

func (o *Options) normalize() {
	if o.Entry == "" {
		o.Entry = "/index.html"
	}
	if o.NotFound == "" {
		o.NotFound = "/404.html"
	}
}

// cleanPath validates and normalizes a tar entry name to "/a/b" form.
// Validation happens on the raw segments, not the cleaned result, so even
// traversal that would resolve safely (a/../b) is rejected outright.
func cleanPath(name string) (string, error) {
	if name == "" || len(name) > 512 || strings.ContainsRune(name, '\\') ||
		strings.HasPrefix(name, "/") {
		return "", fmt.Errorf("%w: %q", ErrBadPath, name)
	}
	for _, seg := range strings.Split(name, "/") {
		if seg == "" || seg == "." || seg == ".." {
			return "", fmt.Errorf("%w: %q", ErrBadPath, name)
		}
	}
	clean := "/" + path.Clean(name)
	if strings.Contains(clean, "\x00") {
		return "", fmt.Errorf("%w: %q", ErrBadPath, name)
	}
	return clean, nil
}

// mimeOf picks a Content-Type: extension table first, content sniffing as
// fallback for extensionless or unknown files.
func mimeOf(p string, data []byte) string {
	if t := mime.TypeByExtension(path.Ext(p)); t != "" {
		return t
	}
	n := len(data)
	if n > 512 {
		n = 512
	}
	return http.DetectContentType(data[:n])
}
