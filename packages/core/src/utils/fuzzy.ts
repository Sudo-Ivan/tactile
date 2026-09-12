// fzf-style fuzzy matching used by collection search. A pattern matches when
// all its characters appear in the text in order; the score rewards
// consecutive runs and word/camelCase boundaries and penalises gaps. The
// desktop app mirrors this logic in Rust (src-tauri/src/commands/search_engine.rs)
// so both platforms rank identically.

export interface FuzzyMatch {
	score: number;
	// Character indices in the text that matched, ascending.
	indices: number[];
}

const SCORE_MATCH = 10;
const BONUS_BOUNDARY = 8;
const BONUS_CAMEL = 6;
const BONUS_CONSECUTIVE = 8;
const PENALTY_GAP = 1;

function isWordChar(c: string): boolean {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');
}

function isLower(c: string): boolean {
	return c >= 'a' && c <= 'z';
}

// Bonus for a match at position i: strongest at the start of the text or
// right after a separator, then camelCase transitions.
function boundaryBonus(text: string, i: number): number {
	if (i === 0) return BONUS_BOUNDARY;
	const prev = text[i - 1];
	if (!isWordChar(prev)) return BONUS_BOUNDARY;
	if (isLower(prev) && !isLower(text[i])) return BONUS_CAMEL;
	return 0;
}

export function fuzzyMatch(
	pattern: string,
	text: string,
	caseSensitive = false
): FuzzyMatch | null {
	if (pattern.length === 0) return { score: 0, indices: [] };
	if (pattern.length > text.length) return null;

	const haystack = caseSensitive ? text : text.toLowerCase();
	const needle = caseSensitive ? pattern : pattern.toLowerCase();

	const indices: number[] = [];
	let score = 0;
	let cursor = 0;
	let previousIndex = -1;

	for (const char of needle) {
		const found = haystack.indexOf(char, cursor);
		if (found === -1) return null;
		indices.push(found);
		score += SCORE_MATCH + boundaryBonus(text, found);
		if (previousIndex !== -1) {
			if (found === previousIndex + 1) {
				score += BONUS_CONSECUTIVE;
			} else {
				score -= (found - previousIndex - 1) * PENALTY_GAP;
			}
		}
		cursor = found + 1;
		previousIndex = found;
	}

	return { score, indices };
}

// Word-boundary substring match. Returns the match offsets in the text.
export function wordMatch(pattern: string, text: string, caseSensitive = false): FuzzyMatch | null {
	if (pattern.length === 0) return { score: 0, indices: [] };
	const haystack = caseSensitive ? text : text.toLowerCase();
	const needle = caseSensitive ? pattern : pattern.toLowerCase();

	let cursor = 0;
	while (cursor <= haystack.length - needle.length) {
		const found = haystack.indexOf(needle, cursor);
		if (found === -1) return null;
		const before = found === 0 ? ' ' : haystack[found - 1];
		const after = found + needle.length >= haystack.length ? ' ' : haystack[found + needle.length];
		if (!isWordChar(before) && !isWordChar(after)) {
			const indices: number[] = [];
			for (let i = 0; i < needle.length; i++) indices.push(found + i);
			return { score: (SCORE_MATCH + BONUS_CONSECUTIVE) * needle.length + BONUS_BOUNDARY, indices };
		}
		cursor = found + 1;
	}
	return null;
}

// Exact substring match. Used before falling back to fuzzy so literal hits
// always win over scattered ones at the same position.
export function exactMatch(
	pattern: string,
	text: string,
	caseSensitive = false
): FuzzyMatch | null {
	if (pattern.length === 0) return { score: 0, indices: [] };
	const haystack = caseSensitive ? text : text.toLowerCase();
	const needle = caseSensitive ? pattern : pattern.toLowerCase();
	const found = haystack.indexOf(needle);
	if (found === -1) return null;
	const indices: number[] = [];
	for (let i = 0; i < needle.length; i++) indices.push(found + i);
	return {
		score:
			(SCORE_MATCH + BONUS_CONSECUTIVE) * needle.length +
			boundaryBonus(text, found) +
			BONUS_BOUNDARY,
		indices
	};
}

export type MatchMode = 'fuzzy' | 'word' | 'exact';

// Pick the best match for a single term under the given mode. 'fuzzy' tries
// exact first and only then falls back to subsequence matching, which keeps
// literal hits scoring above approximate ones.
export function matchTerm(
	term: string,
	text: string,
	mode: MatchMode,
	caseSensitive = false
): FuzzyMatch | null {
	if (mode === 'word') return wordMatch(term, text, caseSensitive);
	const exact = exactMatch(term, text, caseSensitive);
	if (exact || mode === 'exact') return exact;
	return fuzzyMatch(term, text, caseSensitive);
}

// Merge per-term match indices into [start, end) highlight ranges.
export function toHighlightRanges(indices: number[]): [number, number][] {
	if (indices.length === 0) return [];
	const sorted = [...indices].sort((a, b) => a - b);
	const ranges: [number, number][] = [];
	let start = sorted[0];
	let end = sorted[0] + 1;
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i] === end) {
			end = sorted[i] + 1;
		} else {
			ranges.push([start, end]);
			start = sorted[i];
			end = sorted[i] + 1;
		}
	}
	ranges.push([start, end]);
	return ranges;
}

// Insert <mark class="..."> around highlight ranges. Ranges are UTF-16 code
// unit offsets into text, non-overlapping and ascending.
export function applyHighlights(
	text: string,
	ranges: [number, number][],
	markClass: string
): string {
	if (ranges.length === 0) return escapeHtml(text);
	let out = '';
	let cursor = 0;
	for (const [start, end] of ranges) {
		out += escapeHtml(text.slice(cursor, start));
		out += `<mark class="${markClass}">${escapeHtml(text.slice(start, end))}</mark>`;
		cursor = end;
	}
	out += escapeHtml(text.slice(cursor));
	return out;
}

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
