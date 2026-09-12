import { describe, expect, it } from 'vitest';
import {
	applyHighlights,
	exactMatch,
	fuzzyMatch,
	matchTerm,
	toHighlightRanges,
	wordMatch
} from './fuzzy';

describe('fuzzyMatch', () => {
	it('matches subsequences in order', () => {
		expect(fuzzyMatch('nmd', 'normalized')).not.toBeNull();
		expect(fuzzyMatch('dnm', 'normalized')).toBeNull();
	});

	it('is case insensitive by default', () => {
		expect(fuzzyMatch('TODO', 'todo list')).not.toBeNull();
		expect(fuzzyMatch('TODO', 'todo list', true)).toBeNull();
	});

	it('scores consecutive matches higher than scattered ones', () => {
		const tight = fuzzyMatch('meet', 'meeting notes')!;
		const loose = fuzzyMatch('meet', 'm e e t')!;
		expect(tight.score).toBeGreaterThan(loose.score);
	});

	it('prefers word boundaries', () => {
		const boundary = fuzzyMatch('list', 'shopping list')!;
		const midWord = fuzzyMatch('list', 'playlisted')!;
		expect(boundary.score).toBeGreaterThan(midWord.score);
	});

	it('returns matched indices', () => {
		const match = fuzzyMatch('ab', 'axb')!;
		expect(match.indices).toEqual([0, 2]);
	});
});

describe('wordMatch', () => {
	it('requires word boundaries', () => {
		expect(wordMatch('cat', 'the cat sat')).not.toBeNull();
		expect(wordMatch('cat', 'concatenate')).toBeNull();
	});
});

describe('exactMatch', () => {
	it('finds literal substrings only', () => {
		expect(exactMatch('not', 'notes')).not.toBeNull();
		expect(exactMatch('n o t', 'notes')).toBeNull();
	});
});

describe('matchTerm', () => {
	it('prefers exact over fuzzy', () => {
		const match = matchTerm('notes', 'my notes file', 'fuzzy')!;
		// exact hit gets boundary + consecutive bonuses
		expect(match.indices).toEqual([3, 4, 5, 6, 7]);
	});

	it('falls back to fuzzy when there is no substring', () => {
		expect(matchTerm('ntf', 'my notes file', 'fuzzy')).not.toBeNull();
		expect(matchTerm('ntf', 'my notes file', 'exact')).toBeNull();
	});
});

describe('toHighlightRanges', () => {
	it('merges adjacent indices', () => {
		expect(toHighlightRanges([0, 1, 2, 5, 7])).toEqual([
			[0, 3],
			[5, 6],
			[7, 8]
		]);
	});
});

describe('applyHighlights', () => {
	it('wraps ranges in mark tags and escapes html', () => {
		const out = applyHighlights('a <b> c', [[2, 5]], 'hl');
		expect(out).toBe('a <mark class="hl">&lt;b&gt;</mark> c');
	});
});
