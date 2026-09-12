package bundle

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"errors"
	"testing"
)

func makeTar(t *testing.T, gz bool, entries map[string]any) []byte {
	t.Helper()
	var buf bytes.Buffer
	var w *tar.Writer
	var gzw *gzip.Writer
	if gz {
		gzw = gzip.NewWriter(&buf)
		w = tar.NewWriter(gzw)
	} else {
		w = tar.NewWriter(&buf)
	}
	for name, v := range entries {
		switch e := v.(type) {
		case string:
			if err := w.WriteHeader(&tar.Header{Name: name, Typeflag: tar.TypeReg, Mode: 0o644, Size: int64(len(e))}); err != nil {
				t.Fatal(err)
			}
			if _, err := w.Write([]byte(e)); err != nil {
				t.Fatal(err)
			}
		case byte:
			if err := w.WriteHeader(&tar.Header{Name: name, Typeflag: e, Mode: 0o644, Linkname: "x"}); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	if gzw != nil {
		if err := gzw.Close(); err != nil {
			t.Fatal(err)
		}
	}
	return buf.Bytes()
}

var testLimits = Limits{MaxFiles: 10, MaxFileBytes: 1 << 20, MaxSiteBytes: 4 << 20}

func extract(t *testing.T, data []byte, lim Limits) ([]File, Options, error) {
	t.Helper()
	return Extract(bytes.NewReader(data), lim, func(f File, d []byte) error { return nil })
}

func TestExtractPlain(t *testing.T) {
	b := makeTar(t, false, map[string]any{
		"index.html": "<h1>hi</h1>",
		"css/a.css":  "body{}",
	})
	files, opts, err := extract(t, b, testLimits)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 2 {
		t.Fatalf("want 2 files, got %d", len(files))
	}
	if opts.Entry != "/index.html" {
		t.Fatalf("bad default entry %q", opts.Entry)
	}
	for _, f := range files {
		if f.Path[0] != '/' {
			t.Fatalf("unnormalized path %q", f.Path)
		}
		if f.MIME == "" {
			t.Fatalf("no mime for %s", f.Path)
		}
	}
}

func TestExtractGzip(t *testing.T) {
	b := makeTar(t, true, map[string]any{"index.html": "<h1>x</h1>"})
	files, _, err := extract(t, b, testLimits)
	if err != nil || len(files) != 1 {
		t.Fatalf("gzip extract: %v files=%d", err, len(files))
	}
}

func TestRejectsTraversal(t *testing.T) {
	for _, name := range []string{"../x", "a/../../x", "/abs", "a//../x", `a\..\x`} {
		b := makeTar(t, false, map[string]any{name: "x"})
		if _, _, err := extract(t, b, testLimits); !errors.Is(err, ErrBadPath) {
			t.Fatalf("%q: want ErrBadPath, got %v", name, err)
		}
	}
}

func TestRejectsSymlink(t *testing.T) {
	b := makeTar(t, false, map[string]any{"link": byte(tar.TypeSymlink)})
	if _, _, err := extract(t, b, testLimits); !errors.Is(err, ErrBadPath) {
		t.Fatalf("want ErrBadPath, got %v", err)
	}
}

func TestRejectsDup(t *testing.T) {
	var buf bytes.Buffer
	w := tar.NewWriter(&buf)
	for i := 0; i < 2; i++ {
		_ = w.WriteHeader(&tar.Header{Name: "a.txt", Typeflag: tar.TypeReg, Size: 1})
		_, _ = w.Write([]byte("x"))
	}
	_ = w.Close()
	if _, _, err := extract(t, buf.Bytes(), testLimits); !errors.Is(err, ErrDupPath) {
		t.Fatalf("want ErrDupPath, got %v", err)
	}
}

func TestManifestOptions(t *testing.T) {
	b := makeTar(t, false, map[string]any{
		"index.html":   "x",
		"publish.json": `{"title":"My Site","noindex":true,"entry":"/home.html"}`,
	})
	_, opts, err := extract(t, b, testLimits)
	if err != nil {
		t.Fatal(err)
	}
	if opts.Title != "My Site" || !opts.NoIndex || opts.Entry != "/home.html" {
		t.Fatalf("bad options %+v", opts)
	}
}

func TestLimits(t *testing.T) {
	b := makeTar(t, false, map[string]any{"a": "x", "b": "y", "c": "z"})
	lim := testLimits
	lim.MaxFiles = 2
	if _, _, err := extract(t, b, lim); !errors.Is(err, ErrTooMany) {
		t.Fatalf("want ErrTooMany, got %v", err)
	}
}
