package tier

import (
	"errors"
	"testing"
	"time"
)

func TestMintVerify(t *testing.T) {
	secret := []byte("operator-secret")
	tok, err := Mint(secret, "pro", 24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	name, err := Verify([][]byte{secret}, tok, time.Now().Unix())
	if err != nil || name != "pro" {
		t.Fatalf("verify: %v %q", err, name)
	}
}

func TestVerifyRotation(t *testing.T) {
	old := []byte("old-secret")
	newS := []byte("new-secret")
	tok, _ := Mint(old, "free", time.Hour)
	name, err := Verify([][]byte{newS, old}, tok, time.Now().Unix())
	if err != nil || name != "free" {
		t.Fatalf("rotation: %v", err)
	}
}

func TestVerifyBad(t *testing.T) {
	secret := []byte("s")
	tok, _ := Mint(secret, "free", time.Hour)
	if _, err := Verify([][]byte{[]byte("other")}, tok, time.Now().Unix()); !errors.Is(err, ErrBadSig) {
		t.Fatalf("want ErrBadSig, got %v", err)
	}
	if _, err := Verify([][]byte{secret}, "garbage", 0); !errors.Is(err, ErrMalformed) {
		t.Fatalf("want ErrMalformed, got %v", err)
	}
	expTok, _ := Mint(secret, "free", -time.Hour)
	if _, err := Verify([][]byte{secret}, expTok, time.Now().Unix()); !errors.Is(err, ErrExpired) {
		t.Fatalf("want ErrExpired, got %v", err)
	}
}

func TestLoadTiersDefaults(t *testing.T) {
	m, err := LoadTiers("")
	if err != nil || m["free"].MaxSites <= 0 {
		t.Fatalf("defaults: %v", err)
	}
}
