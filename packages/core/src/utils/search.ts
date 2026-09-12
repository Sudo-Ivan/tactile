import { isInternalPath, isUnder } from '@tactile/storage';
import { MARKDOWN_EXTENSION } from '../constants';
import { getStorage } from '../storage';
import type { SearchResultParams } from '../types';
import { matchTerm, toHighlightRanges, type MatchMode } from './fuzzy';

// In-memory content cache for full-text search. Notes are small and a
// collection is at most a few thousand files, so a per-collection cache
// invalidated by change events beats re-reading every file on each keystroke.
const contentCache = new Map<string, string>();
let cacheCollection: string | undefined;
let cacheSubscribed = false;

// Bounds so a broad query cannot flood the UI with thousands of rows.
const MAX_MATCHES_PER_FILE = 12;
const MAX_RESULTS = 400;

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

interface FileSearchResult {
	results: SearchResultParams[];
	// Aggregate used to order files: name matches dominate, then the best
	// content line, then breadth of coverage.
	score: number;
}

// Search a single file: file name first, then content lines. Every
// whitespace-separated term must match somewhere (name or content) for the
// file to be included.
function searchFile(
	path: string,
	content: string,
	terms: string[],
	mode: MatchMode,
	caseSensitive: boolean
): FileSearchResult | null {
	const results: SearchResultParams[] = [];
	const name = path.split('/').pop() ?? path;

	let nameScore = 0;
	let nameMatchedAll = true;
	const nameIndices: number[] = [];
	for (const term of terms) {
		const match = matchTerm(term, name, mode, caseSensitive);
		if (!match) {
			nameMatchedAll = false;
			break;
		}
		nameScore += match.score;
		nameIndices.push(...match.indices);
	}
	if (nameMatchedAll) {
		results.push({
			path,
			context_preview: name,
			kind: 'name',
			score: nameScore,
			highlights: toHighlightRanges(nameIndices)
		});
	}

	let matchedTermsInContent = true;
	const lineResults: SearchResultParams[] = [];
	let bestLineScore = 0;

	const lines = content.split('\n');
	for (let i = 0; i < lines.length && lineResults.length < MAX_MATCHES_PER_FILE; i++) {
		const line = lines[i];
		if (!line.trim()) continue;

		let lineScore = 0;
		const lineIndices: number[] = [];
		let allTerms = true;
		for (const term of terms) {
			const match = matchTerm(term, line, mode, caseSensitive);
			if (!match) {
				allTerms = false;
				break;
			}
			lineScore += match.score;
			lineIndices.push(...match.indices);
		}
		if (!allTerms) continue;

		bestLineScore = Math.max(bestLineScore, lineScore);
		const startLine = Math.max(0, i - 1);
		const endLine = Math.min(lines.length - 1, i + 1);
		const context = lines.slice(startLine, endLine + 1).join('\n');
		// Match indices are relative to the matched line; shift them into the
		// context window so highlights land on the right characters.
		const lineOffset = lines.slice(startLine, i).reduce((sum, l) => sum + l.length + 1, 0);
		lineResults.push({
			path,
			context_preview: context,
			kind: 'content',
			line: i + 1,
			score: lineScore,
			highlights: toHighlightRanges(lineIndices.map((idx) => idx + lineOffset))
		});
	}

	if (!nameMatchedAll) {
		// With no name match, every term still has to appear in the content.
		for (const term of terms) {
			if (!matchTerm(term, content, mode, caseSensitive)) {
				matchedTermsInContent = false;
				break;
			}
		}
	}
	if (!nameMatchedAll && (!matchedTermsInContent || lineResults.length === 0)) return null;

	lineResults.sort((a, b) => b.score - a.score);
	results.push(...lineResults);

	const score = (nameMatchedAll ? nameScore + 100 : 0) + bestLineScore + lineResults.length * 3;
	return { results, score };
}

export interface SearchOptions {
	caseSensitive?: boolean;
	// 'fuzzy' (default): fzf-style subsequence matching. 'word': whole-word
	// matches only. 'exact': literal substring, no fuzzy fallback.
	mode?: MatchMode;
}

export async function searchEntries(
	collectionPath: string,
	query: string,
	options: SearchOptions = {}
): Promise<SearchResultParams[]> {
	const terms = query.trim().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return [];

	const mode = options.mode ?? 'fuzzy';
	const caseSensitive = options.caseSensitive ?? false;
	const contents = await ensureCache(collectionPath);
	const perFile: FileSearchResult[] = [];

	for (const [path, content] of contents) {
		if (!isUnder(path, collectionPath) || isInternalPath(path)) continue;
		const result = searchFile(path, content, terms, mode, caseSensitive);
		if (result) perFile.push(result);
	}

	perFile.sort((a, b) => b.score - a.score);
	return perFile.flatMap((file) => file.results).slice(0, MAX_RESULTS);
}

// Group search results by file path, preserving the score ordering
// produced by search. Used by the collection search results and the task
// list views.
export function groupResultsByPath<T extends { path: string }>(results: T[]): Record<string, T[]> {
	const grouped: Record<string, T[]> = {};
	for (const result of results) {
		(grouped[result.path] ??= []).push(result);
	}
	return grouped;
}

// Re-exports so desktop search UI, which only needs display helpers and the
// result type (matching runs in Rust), has a single import surface.
export { applyHighlights, escapeHtml } from './fuzzy';
export type { MatchMode } from './fuzzy';
export type { SearchResultParams } from '../types';
