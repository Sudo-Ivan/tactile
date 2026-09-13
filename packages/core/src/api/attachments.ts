import { getStorage } from '../storage';
import { appState } from '../state/app.svelte';

// Attachments live in a visible attachments/ directory at the collection
// root and are referenced from notes by their collection-relative path
// (attachments/foo.png), so markdown stays portable across apps and the
// publish flow.

export const ATTACHMENTS_DIR = 'attachments';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'opus', 'aac']);

export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';

export function attachmentKind(src: string): AttachmentKind {
	const ext = src.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() ?? '';
	if (IMAGE_EXTS.has(ext)) return 'image';
	if (VIDEO_EXTS.has(ext)) return 'video';
	if (AUDIO_EXTS.has(ext)) return 'audio';
	return 'file';
}

// True when the src points at a remote/embedded resource rather than a
// collection-relative attachment path.
export function isExternalSrc(src: string): boolean {
	return /^(https?:|data:|blob:|mailto:)/i.test(src);
}

// Keep filenames safe and boring: no separators, no control chars, no
// leading dots (hidden files are filtered from the tree).
function sanitizeName(name: string): string {
	let clean = name
		.replace(/[/\\?%*:|"<>]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	clean = clean.replace(/^[\s.]+/, '').trim(); // no leading dots (hidden/traversal)
	return clean || 'attachment';
}

// Pick a collision-free name inside the attachments dir:
// name.ext, name (1).ext, name (2).ext, ...
async function uniqueName(
	storage: Awaited<ReturnType<typeof getStorage>>,
	dir: string,
	name: string
) {
	const dot = name.lastIndexOf('.');
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : '';
	let candidate = name;
	for (let i = 1; await storage.exists(`${dir}/${candidate}`); i++) {
		candidate = `${stem} (${i})${ext}`;
	}
	return candidate;
}

export interface ImportedAttachment {
	// collection-relative path stored in markdown, e.g. attachments/x.png
	src: string;
	name: string;
	mime: string;
}

// Write files dropped or pasted into the editor into the attachments
// dir and return their markdown src paths.
export async function importAttachments(files: File[]): Promise<ImportedAttachment[]> {
	if (!appState.collection) return [];
	const storage = await getStorage();
	const dir = `${appState.collection}/${ATTACHMENTS_DIR}`;
	await storage.mkdir(dir, { recursive: true });

	const out: ImportedAttachment[] = [];
	for (const file of files) {
		const name = await uniqueName(storage, dir, sanitizeName(file.name || 'attachment'));
		const bytes = new Uint8Array(await file.arrayBuffer());
		await storage.writeFile(`${dir}/${name}`, bytes);
		out.push({ src: `${ATTACHMENTS_DIR}/${name}`, name, mime: file.type });
	}
	return out;
}

// ---------------------------------------------------------------------------
// Blob URL cache: nodeviews render attachments through object URLs built
// from storage bytes. Cached by absolute path for the session and cleared
// when the collection changes.

const urlCache = new Map<string, Promise<string>>();

export function resolveAttachmentUrl(src: string): Promise<string> {
	if (isExternalSrc(src)) return Promise.resolve(src);
	const path = `${appState.collection}/${src}`;
	let pending = urlCache.get(path);
	if (!pending) {
		pending = (async () => {
			const storage = await getStorage();
			const bytes = await storage.readFile(path);
			return URL.createObjectURL(new Blob([bytes as BlobPart]));
		})();
		urlCache.set(path, pending);
		// Failed lookups (missing file) must not poison the cache.
		pending.catch(() => urlCache.delete(path));
	}
	return pending;
}

export function clearAttachmentCache() {
	for (const pending of urlCache.values()) {
		pending.then((url) => URL.revokeObjectURL(url)).catch(() => {});
	}
	urlCache.clear();
}
