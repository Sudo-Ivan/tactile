package protocol

import (
	"errors"
	"strings"
	"testing"
)

func TestDecodeRoundtrip(t *testing.T) {
	in := Put{Type: TypePut, ID: "aWQ=", Payload: "cGF5bG9hZA==", TTLSeconds: 3600, Sig: "c2ln"}
	data, err := Encode(in)
	if err != nil {
		t.Fatal(err)
	}
	typ, msg, err := Decode(data, 1<<20)
	if err != nil {
		t.Fatal(err)
	}
	if typ != TypePut {
		t.Fatalf("type = %q", typ)
	}
	out := msg.(*Put)
	if out.ID != in.ID || out.Payload != in.Payload || out.TTLSeconds != in.TTLSeconds {
		t.Fatal("roundtrip mismatch")
	}
}

func TestDecodeAllTypes(t *testing.T) {
	for _, typ := range []string{TypeAuth, TypePut, TypeGet, TypeDel, TypeList, TypeSub, TypeSignal} {
		data := []byte(`{"type":"` + typ + `"}`)
		got, _, err := Decode(data, 1<<20)
		if err != nil {
			t.Fatalf("%s: %v", typ, err)
		}
		if got != typ {
			t.Fatalf("got %q want %q", got, typ)
		}
	}
}

func TestDecodeRejects(t *testing.T) {
	cases := []struct {
		name string
		data string
	}{
		{"unknown type", `{"type":"nope"}`},
		{"unknown field", `{"type":"put","id":"a","payload":"b","ttl_seconds":1,"sig":"s","evil":1}`},
		{"trailing", `{"type":"sub"} {"x":1}`},
		{"not json", `garbage`},
		{"empty", ``},
	}
	for _, c := range cases {
		if _, _, err := Decode([]byte(c.data), 1<<20); err == nil {
			t.Errorf("%s: expected error", c.name)
		}
	}
}

func TestDecodeTooLarge(t *testing.T) {
	data := []byte(`{"type":"sub"}`)
	if _, _, err := Decode(data, 4); !errors.Is(err, ErrMessageTooLarge) {
		t.Fatalf("err = %v", err)
	}
}

func FuzzDecode(f *testing.F) {
	seeds := []string{
		`{"type":"auth","pubkey":"AAAA","sig":"BBBB"}`,
		`{"type":"put","id":"a","payload":"b","ttl_seconds":5,"sig":"s"}`,
		`{"type":"signal","to":"x","payload":"y"}`,
		`{"type":"list"}`,
		`{}`, `[]`, `"str"`, `123`, `null`,
	}
	for _, s := range seeds {
		f.Add([]byte(s))
	}
	f.Fuzz(func(t *testing.T, data []byte) {
		// Must never panic; error or success both fine.
		Decode(data, 1<<16)
	})
}

func TestEncodeTypes(t *testing.T) {
	// Guard against forgetting to set Type on outbound messages.
	for _, v := range []any{
		Hello{Type: TypeHello},
		OK{Type: TypeOK},
		PutOK{Type: TypePutOK},
		Error{Type: TypeError},
		Blob{Type: TypeBlob},
		Blobs{Type: TypeBlobs},
		Event{Type: TypeEvent},
		SignalFrom{Type: TypeSignal},
	} {
		data, err := Encode(v)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(data), `"type"`) {
			t.Fatalf("%T missing type field", v)
		}
	}
}
