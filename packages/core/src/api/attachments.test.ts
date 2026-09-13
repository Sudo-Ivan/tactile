import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appState } from '../state/app.svelte';
import { attachmentKind, importAttachments, isExternalSrc } from './attachments';

// In-memory storage backend covering just what attachments.ts touches.
const written = new Map<string, Uint8Array>();

vi.mock('../storage', () => ({
	getStorage: async () => ({
		mkdir: async () => {},
		exists: async (path: string) => written.has(path),
		readFile: async (path: string) => {
			const bytes = written.get(path);
			if (bytes === undefined) throw new Error('not found');
			return bytes;
		},
		writeFile: async (path: string, bytes: Uint8Array) => {
			written.set(path, bytes);
		}
	})
}));

describe('attachmentKind', () => {
	it('classifies by extension', () => {
		expect(attachmentKind('attachments/a.png')).toBe('image');
		expect(attachmentKind('attachments/a.gif')).toBe('image');
		expect(attachmentKind('attachments/a.mp4')).toBe('video');
		expect(attachmentKind('attachments/a.mp3')).toBe('audio');
		expect(attachmentKind('attachments/a.pdf')).toBe('file');
		expect(attachmentKind('attachments/noext')).toBe('file');
		expect(attachmentKind('attachments/A.WEBP')).toBe('image');
	});
});

describe('isExternalSrc', () => {
	it('detects remote and embedded sources', () => {
		expect(isExternalSrc('https://x.com/a.png')).toBe(true);
		expect(isExternalSrc('data:image/png;base64,xx')).toBe(true);
		expect(isExternalSrc('attachments/a.png')).toBe(false);
	});
});

describe('importAttachments', () => {
	beforeEach(() => {
		written.clear();
		appState.collection = '/vault';
	});

	const file = (name: string, data = 'x') =>
		new File([data], name, { type: 'application/octet-stream' });

	it('writes into the collection attachments dir with relative src', async () => {
		const out = await importAttachments([file('pic.png')]);
		expect(out).toEqual([
			{ src: 'attachments/pic.png', name: 'pic.png', mime: expect.any(String) }
		]);
		expect([...written.keys()]).toEqual(['/vault/attachments/pic.png']);
	});

	it('dedupes colliding names', async () => {
		await importAttachments([file('a.png')]);
		const out = await importAttachments([file('a.png'), file('a.png')]);
		expect(out.map((o) => o.src)).toEqual(['attachments/a (1).png', 'attachments/a (2).png']);
	});

	it('sanitizes hostile filenames', async () => {
		const out = await importAttachments([file('../..evil<script>.png'), file('')]);
		expect(out[0].src.startsWith('attachments/')).toBe(true);
		expect(out[0].src).not.toContain('..');
		expect(out[0].src).not.toContain('<');
		expect(out[1].src).toBe('attachments/attachment');
	});
});

describe('blob url cache', () => {
	it('refcounts acquire/release and revokes when free', async () => {
		const { acquireAttachmentUrl, releaseAttachmentUrl, clearAttachmentCache } =
			await import('./attachments');
		const revoked: string[] = [];
		const created: string[] = [];
		vi.stubGlobal('URL', {
			...URL,
			createObjectURL: () => {
				const u = `blob:mock-${created.length}`;
				created.push(u);
				return u;
			},
			revokeObjectURL: (u: string) => {
				revoked.push(u);
			}
		});
		written.set('/vault/attachments/x.png', new Uint8Array([1]));

		const p1 = acquireAttachmentUrl('attachments/x.png');
		const p2 = acquireAttachmentUrl('attachments/x.png');
		expect(await p1).toBe(await p2); // shared
		expect(created).toHaveLength(1);

		releaseAttachmentUrl('attachments/x.png');
		expect(revoked).toHaveLength(0); // still referenced
		releaseAttachmentUrl('attachments/x.png');
		await Promise.resolve();
		expect(revoked).toEqual([created[0]]);

		clearAttachmentCache();
		vi.unstubAllGlobals();
	});
});
