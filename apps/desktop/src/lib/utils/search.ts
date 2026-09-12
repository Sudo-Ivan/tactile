// Display helpers for collection search results. The matching itself lives in
// Rust (src-tauri/src/commands/search_engine.rs) which mirrors the web app's
// fuzzy scoring.

export interface SearchResultParams {
	path: string;
	context_preview: string;
	// 'name' results matched the file name; 'content' results matched a line.
	kind: 'name' | 'content';
	// 1-based line number of the match for content results.
	line_number?: number;
	// Ranking score, higher is better.
	score: number;
	// [start, end) UTF-16 ranges to highlight inside context_preview.
	highlights: [number, number][];
}

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// Insert <mark class="..."> around highlight ranges. Ranges are UTF-16 code
// unit offsets into text, non-overlapping and ascending.
export function applyHighlights(
	text: string,
	ranges: [number, number][],
	markClass: string
): string {
	if (!ranges || ranges.length === 0) return escapeHtml(text);
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
