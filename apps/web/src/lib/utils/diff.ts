// Line-based diff used by the version history panel. LCS over line arrays:
// notes are small enough that the quadratic DP is fine, and common
// prefix/suffix trimming keeps the DP small for the common "edited one
// paragraph" case.

export type DiffLineType = 'same' | 'add' | 'del';

export interface DiffLine {
	type: DiffLineType;
	text: string;
	// 1-based line numbers in the old/new documents. Undefined on the side a
	// line does not belong to.
	oldNumber?: number;
	newNumber?: number;
}

export interface DiffResult {
	lines: DiffLine[];
	added: number;
	removed: number;
	unchanged: number;
	// True when the inputs were too large for the LCS pass and the result is
	// a coarse delete-all/add-all fallback.
	truncated: boolean;
}

// Above this DP cell count the LCS pass is skipped and everything inside the
// trimmed middle is reported as removed + added.
const MAX_CELLS = 4_000_000;

export function diffLines(oldText: string, newText: string): DiffResult {
	if (oldText === newText) {
		const sourceLines = oldText === '' ? [] : oldText.split('\n');
		const lines = sourceLines.map((text, i) => ({
			type: 'same' as const,
			text,
			oldNumber: i + 1,
			newNumber: i + 1
		}));
		return { lines, added: 0, removed: 0, unchanged: lines.length, truncated: false };
	}

	// An empty string is zero lines, not one empty line.
	const a = oldText === '' ? [] : oldText.split('\n');
	const b = newText === '' ? [] : newText.split('\n');

	// Trim common prefix/suffix so the DP only sees the changed middle.
	let prefix = 0;
	while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;

	let suffix = 0;
	while (
		suffix < a.length - prefix &&
		suffix < b.length - prefix &&
		a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
	)
		suffix++;

	const aMid = a.slice(prefix, a.length - suffix);
	const bMid = b.slice(prefix, b.length - suffix);

	const lines: DiffLine[] = [];
	let added = 0;
	let removed = 0;

	for (let i = 0; i < prefix; i++) {
		lines.push({ type: 'same', text: a[i], oldNumber: i + 1, newNumber: i + 1 });
	}

	if (aMid.length * bMid.length > MAX_CELLS) {
		for (let i = 0; i < aMid.length; i++) {
			lines.push({ type: 'del', text: aMid[i], oldNumber: prefix + i + 1 });
			removed++;
		}
		for (let i = 0; i < bMid.length; i++) {
			lines.push({ type: 'add', text: bMid[i], newNumber: prefix + i + 1 });
			added++;
		}
	} else {
		const mid = lcsDiff(aMid, bMid);
		for (const line of mid) {
			const out: DiffLine = { type: line.type, text: line.text };
			if (line.aIndex !== undefined) out.oldNumber = prefix + line.aIndex + 1;
			if (line.bIndex !== undefined) out.newNumber = prefix + line.bIndex + 1;
			if (line.type === 'add') added++;
			if (line.type === 'del') removed++;
			lines.push(out);
		}
	}

	for (let i = 0; i < suffix; i++) {
		const ai = a.length - suffix + i;
		const bi = b.length - suffix + i;
		lines.push({ type: 'same', text: a[ai], oldNumber: ai + 1, newNumber: bi + 1 });
	}

	return {
		lines,
		added,
		removed,
		unchanged: lines.length - added - removed,
		truncated: aMid.length * bMid.length > MAX_CELLS
	};
}

// LCS over the middle slices. Returns interleaved operations in document
// order: deletions before their corresponding additions.
function lcsDiff(
	a: string[],
	b: string[]
): { type: DiffLineType; text: string; aIndex?: number; bIndex?: number }[] {
	const n = a.length;
	const m = b.length;
	const width = m + 1;
	const dp = new Uint32Array((n + 1) * width);

	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i * width + j] =
				a[i] === b[j]
					? dp[(i + 1) * width + j + 1] + 1
					: Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
		}
	}

	const out: { type: DiffLineType; text: string; aIndex?: number; bIndex?: number }[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			out.push({ type: 'same', text: a[i], aIndex: i, bIndex: j });
			i++;
			j++;
		} else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
			out.push({ type: 'del', text: a[i], aIndex: i });
			i++;
		} else {
			out.push({ type: 'add', text: b[j], bIndex: j });
			j++;
		}
	}
	while (i < n) {
		out.push({ type: 'del', text: a[i], aIndex: i });
		i++;
	}
	while (j < m) {
		out.push({ type: 'add', text: b[j], bIndex: j });
		j++;
	}
	return out;
}

export type DisplayRow =
	DiffLine | { type: 'collapsed'; count: number; firstOld: number; firstNew: number };

// Collapse long unchanged runs for display, keeping `context` lines around
// each change. A collapsed row carries the count and the line numbers it
// starts at so a UI could expand it later.
export function collapseUnchanged(lines: DiffLine[], context = 3): DisplayRow[] {
	const rows: DisplayRow[] = [];
	let runStart = -1;
	let runLength = 0;

	const flush = () => {
		if (runLength === 0) return;
		if (runLength <= context * 2 + 1) {
			for (let k = 0; k < runLength; k++) rows.push(lines[runStart + k]);
		} else {
			for (let k = 0; k < context; k++) rows.push(lines[runStart + k]);
			const first = lines[runStart + context];
			rows.push({
				type: 'collapsed',
				count: runLength - context * 2,
				firstOld: first.oldNumber ?? 0,
				firstNew: first.newNumber ?? 0
			});
			for (let k = runLength - context; k < runLength; k++) rows.push(lines[runStart + k]);
		}
		runLength = 0;
		runStart = -1;
	};

	for (let i = 0; i < lines.length; i++) {
		if (lines[i].type === 'same') {
			if (runLength === 0) runStart = i;
			runLength++;
		} else {
			flush();
			rows.push(lines[i]);
		}
	}
	flush();
	return rows;
}
