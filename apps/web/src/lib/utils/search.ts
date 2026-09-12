import { pgClient } from '../database/client';
import type { SearchResultParams } from '../types';

export async function searchEntries(
	collectionPath: string,
	query: string,
	caseSensitive: boolean = false,
	matchWord: boolean = false
): Promise<SearchResultParams[]> {
	const escapedQuery = query.replace(/'/g, "''");
	const likeOperator = caseSensitive ? 'LIKE' : 'ILIKE';
	const wordBoundary = matchWord ? ' ' : '';
	const searchPattern = `%${wordBoundary}${escapedQuery}${wordBoundary}%`;
	const sqlQuery = `
    WITH matched_entries AS (
      SELECT path, content
      FROM entry
      WHERE collection_path = $1
        AND content ${likeOperator} $2
    )
    SELECT path, content
    FROM matched_entries
  `;
	const results = await pgClient.query<{ path: string; content: string }>(sqlQuery, [
		collectionPath,
		searchPattern
	]);
	const searchResults: SearchResultParams[] = [];
	results.rows.forEach((row) => {
		const contexts = extractAllContexts(row.content, escapedQuery, caseSensitive, matchWord);
		contexts.forEach((context) => {
			searchResults.push({
				path: row.path,
				context_preview: context
			});
		});
	});
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
