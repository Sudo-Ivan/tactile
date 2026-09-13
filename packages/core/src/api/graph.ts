import { getStorage } from '../storage';
import { extractNoteLinks, noteIndex, resolveNoteTarget } from './links';

// The note graph: one node per markdown file plus dangling nodes for
// links that point at notes which do not exist yet.

export interface GraphNode {
	// Note path for existing notes; "missing:<name>" for dangling targets.
	id: string;
	name: string;
	exists: boolean;
	path?: string;
}

export interface GraphLink {
	source: string;
	target: string;
}

export interface NoteGraph {
	nodes: GraphNode[];
	links: GraphLink[];
}

// Extracted link targets per note path, keyed by content hash so graph
// rebuilds only re-parse notes that actually changed.
const linkCache = new Map<string, { hash: number; targets: string[] }>();

export function clearGraphCache() {
	linkCache.clear();
}

// FNV-1a, cheap and good enough for change detection.
function hash(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h;
}

const READ_BATCH = 16;

export async function buildNoteGraph(): Promise<NoteGraph> {
	const notes = noteIndex();
	const index = notes;
	const nodes = new Map<string, GraphNode>();
	for (const n of notes) {
		nodes.set(n.path, { id: n.path, name: n.name, exists: true, path: n.path });
	}

	// Drop cache entries for notes that no longer exist.
	const paths = new Set(notes.map((n) => n.path));
	for (const key of linkCache.keys()) {
		if (!paths.has(key)) linkCache.delete(key);
	}

	const links: GraphLink[] = [];
	const seen = new Set<string>();
	const storage = await getStorage();

	// Read notes in bounded batches; unchanged content reuses cached links.
	for (let i = 0; i < notes.length; i += READ_BATCH) {
		const batch = notes.slice(i, i + READ_BATCH);
		const contents = await Promise.all(
			batch.map(async (n) => {
				try {
					return await storage.readTextFile(n.path);
				} catch {
					return null;
				}
			})
		);
		for (let j = 0; j < batch.length; j++) {
			const content = contents[j];
			if (content === null) continue;
			const n = batch[j];
			const h = hash(content);
			let cached = linkCache.get(n.path);
			if (!cached || cached.hash !== h) {
				cached = { hash: h, targets: extractNoteLinks(content) };
				linkCache.set(n.path, cached);
			}
			for (const raw of cached.targets) {
				const targetPath = resolveNoteTarget(raw, index);
				let targetId: string;
				if (targetPath) {
					targetId = targetPath;
				} else {
					const name = raw.split('/').pop()!.replace(/\.md$/i, '').trim();
					if (!name) continue;
					targetId = `missing:${name.toLowerCase()}`;
					if (!nodes.has(targetId)) {
						nodes.set(targetId, { id: targetId, name, exists: false });
					}
				}
				const key = `${n.path}->${targetId}`;
				if (seen.has(key)) continue;
				seen.add(key);
				links.push({ source: n.path, target: targetId });
			}
		}
	}

	return { nodes: [...nodes.values()], links };
}
