import { signAsync } from '@noble/ed25519';
import {
	base64ToBytes,
	bytesToBase64,
	bytesToBase64Url,
	int64LE,
	utf8ToBytes
} from '../utils/encoding';

// TypeScript client for the Tactile sync relay REST API
// (relay/internal/protocol). The relay is blind: it only ever stores
// signed ciphertext addressed to an Ed25519 identity. Every request is
// authorized by a signature over a domain-separated message; GET/LIST/HEAD
// signatures also carry a fresh timestamp so captured requests cannot be
// replayed (server window is 2 minutes, see rest.go restTimeWindow).

const DOMAIN_BLOB = utf8ToBytes('tactile-relay/blob/v1');
const DOMAIN_DEL = utf8ToBytes('tactile-relay/del/v1');
const DOMAIN_REST = utf8ToBytes('tactile-relay/rest/v1');

const REQUEST_TIMEOUT_MS = 15_000;

export interface RelayInfo {
	version: number;
	relay_id: string;
	pow_bits: number;
	max_blob_size: number;
	min_ttl_seconds: number;
	max_ttl_seconds: number;
	identity_quota_bytes: number;
	now: number;
	allow_public: boolean;
	load: {
		conns: number;
		max_conns: number;
		storage_bytes: number;
		storage_cap: number;
		storage_used_pct: number;
	};
}

export interface RelayBlobMeta {
	id: Uint8Array;
	size: number;
	expiresAt: number;
}

export class RelayError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code: string = ''
	) {
		super(message);
		this.name = 'RelayError';
	}
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.length;
	}
	return out;
}

// RelayClient speaks to one relay base URL, e.g. https://relay.example.com.
export class RelayClient {
	readonly baseUrl: string;

	constructor(
		baseUrl: string,
		readonly secretKey: Uint8Array,
		readonly publicKey: Uint8Array
	) {
		this.baseUrl = baseUrl.replace(/\/+$/, '');
	}

	private sign(msg: Uint8Array): Promise<Uint8Array> {
		return signAsync(msg, this.secretKey);
	}

	private get identityHeader(): string {
		return bytesToBase64(this.publicKey);
	}

	// Signed headers for GET/HEAD/LIST: sig over
	// DomainREST || method || id || timestamp (id empty for LIST).
	private async freshSigHeaders(method: string, id?: Uint8Array): Promise<HeadersInit> {
		const ts = Math.floor(Date.now() / 1000).toString();
		const sig = await this.sign(
			concatBytes(DOMAIN_REST, utf8ToBytes(method), id ?? new Uint8Array(0), utf8ToBytes(ts))
		);
		return {
			'X-Tactile-Identity': this.identityHeader,
			'X-Tactile-Timestamp': ts,
			'X-Tactile-Signature': bytesToBase64(sig)
		};
	}

	private static async check(res: Response, okStatuses: number[]): Promise<Response> {
		if (!okStatuses.includes(res.status)) {
			let code = '';
			let message = `status ${res.status}`;
			try {
				const body = (await res.json()) as { code?: string; message?: string };
				code = body.code ?? '';
				message = body.message ?? message;
			} catch {
				// Non-JSON error body; keep the status line.
			}
			throw new RelayError(message, res.status, code);
		}
		return res;
	}

	// Public relay metadata: version, limits, load. Unauthenticated.
	async info(): Promise<RelayInfo> {
		const res = await fetch(`${this.baseUrl}/v1/info`, {
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
		await RelayClient.check(res, [200]);
		return (await res.json()) as RelayInfo;
	}

	// Store a blob. Sig covers DomainBlob || id || ttl(LE64) || payload.
	// Returns false when the id is already stored (409), true on write.
	async put(id: Uint8Array, payload: Uint8Array, ttlSeconds: number): Promise<boolean> {
		const sig = await this.sign(concatBytes(DOMAIN_BLOB, id, int64LE(ttlSeconds), payload));
		const res = await fetch(`${this.baseUrl}/v1/blobs`, {
			method: 'PUT',
			headers: {
				'X-Tactile-Identity': this.identityHeader,
				'X-Tactile-Blob-Id': bytesToBase64(id),
				'X-Tactile-Ttl': String(ttlSeconds),
				'X-Tactile-Signature': bytesToBase64(sig)
			},
			body: payload as unknown as BodyInit,
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
		if (res.status === 409) return false;
		await RelayClient.check(res, [200, 201]);
		return true;
	}

	// Fetch a blob's payload. Returns null on 404/410 (missing or expired).
	async get(id: Uint8Array): Promise<Uint8Array | null> {
		const res = await fetch(`${this.baseUrl}/v1/blobs/${bytesToBase64Url(id)}`, {
			headers: await this.freshSigHeaders('GET', id),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
		if (res.status === 404 || res.status === 410) return null;
		await RelayClient.check(res, [200]);
		const body = (await res.json()) as { payload: string };
		return base64ToBytes(body.payload);
	}

	// List every blob owned by this identity.
	async list(): Promise<RelayBlobMeta[]> {
		const res = await fetch(`${this.baseUrl}/v1/blobs`, {
			headers: await this.freshSigHeaders('LIST'),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
		await RelayClient.check(res, [200]);
		const body = (await res.json()) as {
			items: { id: string; size: number; expires_at: number }[];
		};
		const out: RelayBlobMeta[] = [];
		for (const item of body.items ?? []) {
			const id = base64ToBytes(item.id);
			if (id.length !== 32) continue;
			out.push({ id, size: item.size, expiresAt: item.expires_at });
		}
		return out;
	}

	// Delete a blob. Sig covers DomainDel || id. 404 is fine (already gone).
	async remove(id: Uint8Array): Promise<void> {
		const sig = await this.sign(concatBytes(DOMAIN_DEL, id));
		const res = await fetch(`${this.baseUrl}/v1/blobs/${bytesToBase64Url(id)}`, {
			method: 'DELETE',
			headers: {
				'X-Tactile-Identity': this.identityHeader,
				'X-Tactile-Signature': bytesToBase64(sig)
			},
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});
		await RelayClient.check(res, [200, 204, 404]);
	}
}
