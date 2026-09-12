package tier

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

var testSecret = []byte("test-secret-0123456789")

func TestMintVerify(t *testing.T) {
	tok, err := Mint(testSecret, "pro", 24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	name, err := Verify([][]byte{testSecret}, tok, time.Now().Unix())
	if err != nil {
		t.Fatal(err)
	}
	if name != "pro" {
		t.Fatalf("tier %q", name)
	}
}

func TestVerifyExpired(t *testing.T) {
	tok, _ := Mint(testSecret, "pro", time.Hour)
	if _, err := Verify([][]byte{testSecret}, tok, time.Now().Add(2*time.Hour).Unix()); !errors.Is(err, ErrExpired) {
		t.Fatalf("got %v", err)
	}
}

func TestVerifyBadSig(t *testing.T) {
	tok, _ := Mint(testSecret, "pro", time.Hour)
	if _, err := Verify([][]byte{[]byte("wrong-secret")}, tok, time.Now().Unix()); !errors.Is(err, ErrBadSig) {
		t.Fatalf("got %v", err)
	}
}

func TestVerifyRotation(t *testing.T) {
	old := []byte("old-secret")
	tok, _ := Mint(old, "supporter", time.Hour)
	// Old secret still valid during rotation window.
	name, err := Verify([][]byte{[]byte("new-secret"), old}, tok, time.Now().Unix())
	if err != nil || name != "supporter" {
		t.Fatalf("rotation: %v %q", err, name)
	}
}

func TestVerifyMalformed(t *testing.T) {
	for _, tok := range []string{"", "nosig", "a.", ".b", "!!!.!!!"} {
		if _, err := Verify([][]byte{testSecret}, tok, time.Now().Unix()); err == nil {
			t.Fatalf("accepted %q", tok)
		}
	}
}

func TestLoadTiers(t *testing.T) {
	// Empty path gives defaults.
	m, err := LoadTiers("")
	if err != nil || m["free"].QuotaBytes == 0 {
		t.Fatalf("defaults: %v", err)
	}
	// Valid file.
	dir := t.TempDir()
	p := filepath.Join(dir, "tiers.json")
	if err := os.WriteFile(p, []byte(`{"free":{"quota_bytes":1024,"max_ttl_seconds":60,"max_blob_bytes":512},"big":{"quota_bytes":4096,"max_ttl_seconds":600,"max_blob_bytes":1024}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	m, err = LoadTiers(p)
	if err != nil || m["big"].QuotaBytes != 4096 {
		t.Fatalf("file tiers: %v", err)
	}
	// Missing free tier rejected.
	p2 := filepath.Join(dir, "bad.json")
	os.WriteFile(p2, []byte(`{"big":{"quota_bytes":1,"max_ttl_seconds":1,"max_blob_bytes":1}}`), 0o600)
	if _, err := LoadTiers(p2); err == nil {
		t.Fatal("missing free tier accepted")
	}
}
