import { MARKDOWN_EXTENSION } from '../constants';
import { getStorage } from '../storage';
import type { SearchResultParams } from '../types';
import { isInternalPath, isUnder } from '@tactile/storage';

// In-memory content cache for full-text search. Notes are small and a
// collection is at most a few thousand files, so a per-collection cache
// invalidated by change events beats re-reading every file on each keystroke.
const contentCache = new Map<string, string>();
let cacheCollection: string | undefined;
let cacheSubscribed = false;

async function ensureCache(collectionPath: string): Promise<Map<string, string>> {
	const storage = await getStorage();

	// Drop the cache when the collection changes; rebuild lazily below.
	if (cacheCollection !== collectionPath) {
		contentCache.clear();
		cacheCollection = collectionPath;
	}

	if (!cacheSubscribed) {
		cacheSubscribed = true;
		storage.onDidChange((event) => {
			if (event.oldPath) contentCache.delete(event.oldPath);
			contentCache.delete(event.path);
			// Keep the cache warm: re-read changed markdown files so new files
			// created after the initial scan are searchable too. Internal paths
			// (versions, settings, trash) are excluded.
			if (
				event.kind !== 'delete' &&
				event.path.toLowerCase().endsWith(MARKDOWN_EXTENSION) &&
				!isInternalPath(event.path)
			) {
				storage
					.readTextFile(event.path)
					.then((content) => contentCache.set(event.path, content))
					.catch(() => undefined);
			}
		});
	}

	if (contentCache.size > 0) return contentCache;

	// Populate: walk the collection and read every markdown file. Hidden dirs
	// are skipped except .tactile/daily which holds user-visible daily notes.
	const walk = async (dirPath: string): Promise<void> => {
		let entries;
		try {
			entries = await storage.readDir(dirPath);
		} catch {
			return;
		}
		for (const entry of entries) {
			const path = `${dirPath}/${entry.name}`.replace('//', '/');
			if (entry.isDirectory) {
				if (!entry.name.startsWith('.')) {
					await walk(path);
				} else if (entry.name === '.tactile') {
					const dailyDir = `${path}/daily`;
					await walk(dailyDir);
				}
			} else if (entry.name.toLowerCase().endsWith(MARKDOWN_EXTENSION)) {
				if (isInternalPath(path)) continue;
				try {
					contentCache.set(path, await storage.readTextFile(path));
				} catch {
					// Unreadable file: skip it rather than failing the search.
				}
			}
		}
	};
	await walk(collectionPath);
	return contentCache;
}

export async function searchEntries(
	collectionPath: string,
	query: string,
	caseSensitive: boolean = false,
	matchWord: boolean = false
): Promise<SearchResultParams[]> {
	const wordBoundary = matchWord ? ' ' : '';
	const searchPattern = `${wordBoundary}${query}${wordBoundary}`;

	const contents = await ensureCache(collectionPath);
	const searchResults: SearchResultParams[] = [];

	for (const [path, content] of contents) {
		if (!isUnder(path, collectionPath) || isInternalPath(path)) continue;
		const haystack = caseSensitive ? content : content.toLowerCase();
		const needle = caseSensitive ? searchPattern : searchPattern.toLowerCase();
		if (!haystack.includes(needle)) continue;

		const contexts = extractAllContexts(content, query, caseSensitive, matchWord);
		contexts.forEach((context) => {
			searchResults.push({ path, context_preview: context });
		});
	}

	return searchResults;
}

function extractAllContexts(
	content: string,
	query: string,
	caseSensitive: boolean,
	matchWord: boolean
): string[] {
	const lines = content.split('\n');
	const contexts: string[] = [];
	lines.forEach((line, index) => {
		const compareLine = caseSensitive ? line : line.toLowerCase();
		const compareQuery = caseSensitive ? query : query.toLowerCase();
		if (matchWord) {
			const regex = new RegExp(`(^|\\s)${compareQuery}($|\\s)`, caseSensitive ? '' : 'i');
			if (regex.test(compareLine)) {
				const startLine = Math.max(0, index - 1);
				const endLine = Math.min(lines.length - 1, index + 1);
				contexts.push(lines.slice(startLine, endLine + 1).join('\n'));
			}
		} else if (compareLine.includes(compareQuery)) {
			const startLine = Math.max(0, index - 1);
			const endLine = Math.min(lines.length - 1, index + 1);
			contexts.push(lines.slice(startLine, endLine + 1).join('\n'));
		}
	});
	return contexts;
}
