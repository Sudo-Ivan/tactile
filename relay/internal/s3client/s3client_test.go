package s3client

import (
	"net/http"
	"testing"
)

func TestParseListResult(t *testing.T) {
	body := `<?xml version="1.0"?><ListBucketResult>
	<IsTruncated>false</IsTruncated>
	<Contents><Key>aa/bb-e1700000000.blob</Key><Size>148</Size></Contents>
	<Contents><Key>aa/cc-e1700000100.blob</Key><Size>300</Size></Contents>
	</ListBucketResult>`
	keys, sizes, next, err := parseListResult([]byte(body))
	if err != nil {
		t.Fatal(err)
	}
	if len(keys) != 2 || keys[0] != "aa/bb-e1700000000.blob" || keys[1] != "aa/cc-e1700000100.blob" {
		t.Fatalf("keys %v", keys)
	}
	if sizes[0] != 148 || sizes[1] != 300 {
		t.Fatalf("sizes %v", sizes)
	}
	if next != "" {
		t.Fatalf("unexpected continuation %q", next)
	}
}

func TestParseListResultTruncated(t *testing.T) {
	body := `<ListBucketResult><IsTruncated>true</IsTruncated>
	<NextContinuationToken>tok123</NextContinuationToken>
	<Contents><Key>k</Key><Size>1</Size></Contents></ListBucketResult>`
	_, _, next, err := parseListResult([]byte(body))
	if err != nil {
		t.Fatal(err)
	}
	if next != "tok123" {
		t.Fatalf("next %q", next)
	}
}

func TestEscapePath(t *testing.T) {
	got := escapePath("/bucket/aa/bb-e1.blob")
	if got != "/bucket/aa/bb-e1.blob" {
		t.Fatalf("got %q", got)
	}
}

func TestSignSetsHeaders(t *testing.T) {
	c := New(Config{Endpoint: "http://x", Region: "auto", Bucket: "b", AccessKey: "ak", SecretKey: "sk", PathStyle: true})
	req, _ := http.NewRequest(http.MethodGet, "http://x/b/k", nil)
	c.sign(req)
	if req.Header.Get("Authorization") == "" {
		t.Fatal("no auth header")
	}
	if req.Header.Get("x-amz-date") == "" || req.Header.Get("x-amz-content-sha256") == "" {
		t.Fatal("missing amz headers")
	}
}
