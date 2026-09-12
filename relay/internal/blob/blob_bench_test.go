package blob

import (
	"bytes"
	"testing"
)

func BenchmarkMarshal(b *testing.B) {
	rec, _, _ := testRecord(&testing.T{})
	var buf bytes.Buffer
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		buf.Reset()
		Marshal(&buf, rec)
	}
}

func BenchmarkUnmarshal(b *testing.B) {
	rec, _, _ := testRecord(&testing.T{})
	var buf bytes.Buffer
	Marshal(&buf, rec)
	raw := buf.Bytes()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Unmarshal(bytes.NewReader(raw), 1<<20)
	}
}

func BenchmarkVerify(b *testing.B) {
	rec, _, ttl := testRecord(&testing.T{})
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if !rec.Verify(ttl) {
			b.Fatal("verify failed")
		}
	}
}
