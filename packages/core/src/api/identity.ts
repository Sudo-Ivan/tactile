import { getPublicKeyAsync, utils } from '@noble/ed25519';
import { platformHooks } from '../platform';

// The Tactile identity is an Ed25519 keypair generated per install. The
// public key is what sync relays and publish nodes see and what
// operators put on their allowlist; the seed never leaves the device.

export interface TactileIdentity {
	// 32-byte Ed25519 seed, hex-encoded. Keep private.
	secretKeyHex: string;
	// 32-byte public key, hex-encoded. Share this with node operators.
	publicKeyHex: string;
	// Public key, base64 (the X-Tactile-Identity wire form).
	publicKeyBase64: string;
}

const bytesToHex = (bytes: Uint8Array): string =>
	Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const hexToBytes = (hex: string): Uint8Array => {
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
};

const bytesToBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

const SEED_HEX_RE = /^[0-9a-f]{64}$/i;

let identityPromise: Promise<TactileIdentity> | null = null;

// getIdentity loads the persisted identity, generating and storing one
// on first run. Concurrent callers share a single result.
export function getIdentity(): Promise<TactileIdentity> {
	identityPromise ??= (async () => {
		const stored = (await Promise.resolve(platformHooks()?.readIdentity?.()).catch(() => null)) as
			string | null;
		let secret: Uint8Array;
		if (stored && SEED_HEX_RE.test(stored.trim())) {
			secret = hexToBytes(stored.trim());
		} else {
			secret = utils.randomSecretKey();
			await platformHooks()?.writeIdentity?.(bytesToHex(secret));
		}
		const pub = await getPublicKeyAsync(secret);
		return {
			secretKeyHex: bytesToHex(secret),
			publicKeyHex: bytesToHex(pub),
			publicKeyBase64: bytesToBase64(pub)
		};
	})();
	return identityPromise;
}

// getPublicKeyHex is the display form of the identity.
export async function getPublicKeyHex(): Promise<string> {
	return (await getIdentity()).publicKeyHex;
}
