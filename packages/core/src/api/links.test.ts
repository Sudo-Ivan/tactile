import { beforeEach, describe, expect, it } from 'vitest';
import { appState } from '../state/app.svelte';
import { extractNoteLinks, noteIndex, resolveNoteTarget } from './links';

describe('extractNoteLinks', () => {
	it('extracts wikilinks and aliases', () => {
		const links = extractNoteLinks('See [[Note A]] and [[dir/Note B.md|an alias]] and [[C|]].');
		expect(links).toEqual(['Note A', 'dir/Note B.md', 'C']);
	});

	it('extracts markdown links to .md files only', () => {
		const links = extractNoteLinks(
			'[a](./a.md) [b](https://x.com/b.md) [c](../sub/c.md) [img](a.png) [d](x.md#sec)'
		);
		expect(links).toEqual(['./a.md', '../sub/c.md', 'x.md']);
	});

	it('returns empty for plain text', () => {
		expect(extractNoteLinks('no links here')).toEqual([]);
	});
});

describe('resolveNoteTarget', () => {
	beforeEach(() => {
		appState.collection = '/vault';
		appState.activeFile = '/vault/notes/a.md';
		appState.collectionEntries = [
			{
				name: 'notes',
				path: '/vault/notes',
				isDirectory: true,
				children: [
					{ name: 'a.md', path: '/vault/notes/a.md', isFile: true },
					{ name: 'b.md', path: '/vault/notes/b.md', isFile: true },
					{
						name: 'deep',
						path: '/vault/notes/deep',
						isDirectory: true,
						children: [{ name: 'b.md', path: '/vault/notes/deep/b.md', isFile: true }]
					}
				]
			},
			{ name: 'top.md', path: '/vault/top.md', isFile: true },
			{ name: 'image.png', path: '/vault/image.png', isFile: true }
		];
	});

	it('indexes only markdown files', () => {
		expect(
			noteIndex()
				.map((n) => n.name)
				.sort()
		).toEqual(['a', 'b', 'b', 'top']);
	});

	it('resolves exact relative paths', () => {
		expect(resolveNoteTarget('notes/deep/b')).toBe('/vault/notes/deep/b.md');
		expect(resolveNoteTarget('top.md')).toBe('/vault/top.md');
	});

	it('resolves basenames preferring the active dir', () => {
		expect(resolveNoteTarget('b')).toBe('/vault/notes/b.md');
	});

	it('returns null for unknown targets', () => {
		expect(resolveNoteTarget('missing')).toBeNull();
		expect(resolveNoteTarget('')).toBeNull();
	});
});
