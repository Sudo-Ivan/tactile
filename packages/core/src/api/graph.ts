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

export async function buildNoteGraph(): Promise<NoteGraph> {
	const notes = noteIndex();
	const nodes = new Map<string, GraphNode>();
	for (const n of notes) {
		nodes.set(n.path, { id: n.path, name: n.name, exists: true, path: n.path });
	}

	const links: GraphLink[] = [];
	const seen = new Set<string>();
	const storage = await getStorage();

	for (const n of notes) {
		let content: string;
		try {
			content = await storage.readTextFile(n.path);
		} catch {
			continue;
		}
		for (const raw of extractNoteLinks(content)) {
			const targetPath = resolveNoteTarget(raw);
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

	return { nodes: [...nodes.values()], links };
}
