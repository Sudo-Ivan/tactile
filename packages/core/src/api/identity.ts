import { getPublicKeyAsync, utils } from '@noble/ed25519';
import { platformHooks } from '../platform';
import { bytesToBase64, bytesToHex, hexToBytes } from '../utils/encoding';

// The Tactile identity is an Ed25519 keypair generated per install. The
// public key is what sync relays and publish nodes see and what
// operators put on their allowlist; the seed never leaves the device
// unless the user exports a sync code to pair another device.

export interface TactileIdentity {
	// 32-byte Ed25519 seed, hex-encoded. Keep private.
	secretKeyHex: string;
	// 32-byte public key, hex-encoded. Share this with node operators.
	publicKeyHex: string;
	// Public key, base64 (the X-Tactile-Identity wire form).
	publicKeyBase64: string;
}

const SEED_HEX_RE = /^[0-9a-f]{64}$/i;

let identityPromise: Promise<TactileIdentity> | null = null;

async function buildIdentity(secret: Uint8Array): Promise<TactileIdentity> {
	const pub = await getPublicKeyAsync(secret);
	return {
		secretKeyHex: bytesToHex(secret),
		publicKeyHex: bytesToHex(pub),
		publicKeyBase64: bytesToBase64(pub)
	};
}

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
		return buildIdentity(secret);
	})();
	return identityPromise;
}

// setIdentitySeed replaces the persisted identity (sync code import) and
// clears the cached keypair so the next getIdentity returns the new one.
export async function setIdentitySeed(seed: Uint8Array): Promise<TactileIdentity> {
	if (seed.length !== 32) throw new Error('identity seed must be 32 bytes');
	await platformHooks()?.writeIdentity?.(bytesToHex(seed));
	identityPromise = buildIdentity(seed);
	return identityPromise;
}

// getPublicKeyHex is the display form of the identity.
export async function getPublicKeyHex(): Promise<string> {
	return (await getIdentity()).publicKeyHex;
}
