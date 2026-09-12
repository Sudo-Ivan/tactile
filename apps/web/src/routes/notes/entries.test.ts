// @vitest-environment jsdom
import { appState } from '@/store.svelte';
import { render, cleanup } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Entries from './entries.svelte';

vi.mock('@/api/notes', () => ({
	createNote: vi.fn(),
	deleteNote: vi.fn(),
	duplicateNote: vi.fn(),
	moveNote: vi.fn(),
	openNote: vi.fn()
}));

vi.mock('@/api/folders', () => ({
	createFolder: vi.fn(),
	deleteFolder: vi.fn(),
	moveFolder: vi.fn(),
	renameFolder: vi.fn()
}));

// Regression: bind:open={folderOpenStates[i]} used to bind undefined into a
// bindable prop with a fallback while the state array was still empty, which
// crashed the whole route in production (props_invalid_value).
describe('notes entries', () => {
	beforeEach(() => {
		appState.activeFile = null;
		appState.collection = '/collection';
	});

	afterEach(cleanup);

	it('mounts a flat list without throwing', () => {
		const { container } = render(Entries, {
			entries: [
				{ name: 'a.md', path: '/collection/a.md' },
				{ name: 'b.md', path: '/collection/b.md' }
			]
		});
		expect(container.textContent).toContain('a.md');
		expect(container.textContent).toContain('b.md');
	});

	it('mounts nested folders without throwing', () => {
		const { container } = render(Entries, {
			entries: [
				{
					name: 'dir',
					path: '/collection/dir',
					children: [{ name: 'inner.md', path: '/collection/dir/inner.md' }]
				},
				{ name: 'top.md', path: '/collection/top.md' }
			]
		});
		expect(container.textContent).toContain('dir');
		expect(container.textContent).toContain('top.md');
	});
});
