import { MARKDOWN_EXTENSION } from '../constants';
import { appState } from '../state/app.svelte';
import type { FileEntry } from '../types';
import { createNote, openNote } from './notes';

// [[wikilink]] and markdown-note-link resolution. Targets are resolved
// against the open collection the Obsidian way: exact path first, then
// basename match, preferring the active note's directory on ambiguity.

const stripMd = (s: string) => s.replace(/\.md$/i, '');

function flatten(entries: FileEntry[], out: FileEntry[] = []): FileEntry[] {
	for (const e of entries) {
		out.push(e);
		if (e.children) flatten(e.children, out);
	}
	return out;
}

export interface NoteIndexEntry {
	path: string;
	rel: string;
	name: string;
}

// All markdown notes in the open collection as {path, rel, name}.
export function noteIndex(): NoteIndexEntry[] {
	const root = appState.collection;
	if (!root) return [];
	const prefix = root.endsWith('/') ? root : root + '/';
	return flatten(appState.collectionEntries)
		.filter((e) => e.isFile && e.name?.toLowerCase().endsWith(MARKDOWN_EXTENSION))
		.map((e) => {
			const rel = e.path.startsWith(prefix) ? e.path.slice(prefix.length) : e.path;
			return { path: e.path, rel, name: stripMd(e.name!) };
		});
}

// Resolve a wikilink target (Note, dir/Note, Note.md) to an existing
// note path, or null when no note matches. Callers resolving many
// links (the graph builder) should pass a shared index to avoid
// rebuilding it per link.
export function resolveNoteTarget(target: string, index?: NoteIndexEntry[]): string | null {
	const clean = stripMd(target.trim().replace(/^\/+/, ''));
	if (!clean) return null;
	const notes = index ?? noteIndex();
	const lower = clean.toLowerCase();

	// Exact relative-path match.
	const exact = notes.find((n) => stripMd(n.rel).toLowerCase() === lower);
	if (exact) return exact.path;

	// Basename match; prefer a sibling of the active note.
	const matches = notes.filter((n) => n.name.toLowerCase() === lower);
	if (matches.length === 0) return null;
	const activeDir = appState.activeFile?.split('/').slice(0, -1).join('/');
	if (activeDir) {
		const sibling = matches.find((n) => n.path.split('/').slice(0, -1).join('/') === activeDir);
		if (sibling) return sibling.path;
	}
	return matches[0].path;
}

// Open the note a wikilink points at, creating it when it does not exist.
// Path-like targets create inside their directory; bare names create in
// the active note's directory (Obsidian "same folder" behavior).
export async function openWikilink(target: string) {
	const existing = resolveNoteTarget(target);
	if (existing) {
		await openNote(existing);
		return;
	}
	const clean = stripMd(target.trim().replace(/^\/+/, ''));
	if (!clean) return;

	const name = clean.split('/').pop()!;
	let dir: string;
	if (clean.includes('/')) {
		dir = `${appState.collection}/${clean.split('/').slice(0, -1).join('/')}`;
	} else {
		dir = appState.activeFile?.split('/').slice(0, -1).join('/') || appState.collection!;
	}
	await createNote(dir, name);
}

// Extract note-to-note links from markdown content: [[wikilinks]] and
// standard [text](other.md) links. Returns raw targets.
export function extractNoteLinks(content: string): string[] {
	const out: string[] = [];
	// Character classes exclude the opening brackets so the regexes scan
	// linearly: no repetition of '[' or ']]' can force backtracking.
	const wiki = /\[\[([^[\]|\n]+)(?:\|[^[\]\n]*)?\]\]/g;
	let m: RegExpExecArray | null;
	while ((m = wiki.exec(content))) {
		out.push(m[1].trim());
	}
	const md = /\[[^[\]\n]*\]\(([^)\s]+)\)/g;
	while ((m = md.exec(content))) {
		const href = m[1].replace(/^<|>$/g, '').split('#')[0].split('?')[0];
		if (href.toLowerCase().endsWith(MARKDOWN_EXTENSION) && !/^https?:/i.test(href)) {
			out.push(href.trim());
		}
	}
	return out;
}
