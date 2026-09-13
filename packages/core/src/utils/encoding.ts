// Byte <-> text codecs used by the sync client and identity code. Written
// without Buffer or crypto.subtle so they work in every webview and in
// non-secure contexts. Chunked conversions avoid call-stack overflows on
// multi-megabyte payloads.

export function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
	const binary = atob(b64);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		out[i] = binary.charCodeAt(i);
	}
	return out;
}

// URL-safe base64 without padding, matching Go's base64.RawURLEncoding.
export function bytesToBase64Url(bytes: Uint8Array): string {
	return bytesToBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function base64UrlToBytes(b64url: string): Uint8Array {
	const b64 = b64url.replaceAll('-', '+').replaceAll('_', '/');
	const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
	return base64ToBytes(padded);
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function utf8ToBytes(text: string): Uint8Array {
	return textEncoder.encode(text);
}

export function bytesToUtf8(bytes: Uint8Array): string {
	return textDecoder.decode(bytes);
}

// Encode a 64-bit signed integer as 8 little-endian bytes. Number-safe for
// the TTL range the protocol uses (fits well under 2^53).
export function int64LE(value: number | bigint): Uint8Array {
	const out = new Uint8Array(8);
	new DataView(out.buffer).setBigInt64(0, BigInt(value), true);
	return out;
}
