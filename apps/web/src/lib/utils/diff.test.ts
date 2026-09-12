import { describe, expect, it } from 'vitest';
import { collapseUnchanged, diffLines } from './diff';

describe('diffLines', () => {
	it('reports identical texts as all same', () => {
		const result = diffLines('a\nb\nc', 'a\nb\nc');
		expect(result.added).toBe(0);
		expect(result.removed).toBe(0);
		expect(result.unchanged).toBe(3);
		expect(result.lines.every((l) => l.type === 'same')).toBe(true);
	});

	it('detects a single line addition', () => {
		const result = diffLines('a\nc', 'a\nb\nc');
		expect(result.added).toBe(1);
		expect(result.removed).toBe(0);
		expect(result.lines.map((l) => l.type)).toEqual(['same', 'add', 'same']);
		expect(result.lines[1].text).toBe('b');
		expect(result.lines[1].newNumber).toBe(2);
	});

	it('detects a single line deletion', () => {
		const result = diffLines('a\nb\nc', 'a\nc');
		expect(result.removed).toBe(1);
		expect(result.added).toBe(0);
		expect(result.lines.map((l) => l.type)).toEqual(['same', 'del', 'same']);
		expect(result.lines[1].oldNumber).toBe(2);
	});

	it('detects a changed line as del + add', () => {
		const result = diffLines('a\nold\nc', 'a\nnew\nc');
		expect(result.added).toBe(1);
		expect(result.removed).toBe(1);
	});

	it('handles completely different texts', () => {
		const result = diffLines('x\ny', 'p\nq\nr');
		expect(result.added).toBe(3);
		expect(result.removed).toBe(2);
		expect(result.unchanged).toBe(0);
	});

	it('handles empty old text', () => {
		const result = diffLines('', 'a\nb');
		expect(result.added).toBeGreaterThan(0);
		expect(result.removed).toBe(0);
	});

	it('keeps line numbers accurate through edits', () => {
		const oldText = 'one\ntwo\nthree\nfour';
		const newText = 'one\ntwo changed\nthree\nfour\nfive';
		const result = diffLines(oldText, newText);
		const del = result.lines.find((l) => l.type === 'del');
		const add = result.lines.find((l) => l.type === 'add');
		expect(del?.oldNumber).toBe(2);
		expect(add?.newNumber).toBe(2);
	});
});

describe('collapseUnchanged', () => {
	it('collapses long unchanged runs', () => {
		const { lines } = diffLines(
			'1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12',
			'1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\nchanged'
		);
		const rows = collapseUnchanged(lines, 3);
		const collapsed = rows.find((r) => r.type === 'collapsed');
		expect(collapsed).toBeDefined();
		expect(collapsed && 'count' in collapsed ? collapsed.count : 0).toBe(5);
		// 3 context before + collapsed + 3 context after + del + add
		expect(rows.length).toBe(9);
	});

	it('leaves short unchanged runs untouched', () => {
		const { lines } = diffLines('a\nb\nc', 'a\nB\nc');
		const rows = collapseUnchanged(lines, 3);
		expect(rows.every((r) => r.type !== 'collapsed')).toBe(true);
		expect(rows.length).toBe(lines.length);
	});
});
