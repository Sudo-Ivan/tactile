import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import type { MarkdownIt, StateBlock, StateInline } from 'markdown-it';

// Bridge between @tiptap/extension-mathematics and tiptap-markdown: a
// small markdown-it plugin emits the data-type elements the math nodes
// parse, and storage.markdown serializers emit $...$ / $$...$$ so the
// raw TeX round-trips through markdown unchanged.

const esc = (s: string): string =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Pandoc-style inline math: $...$ where the content does not start or
// end with whitespace and the closing $ is not followed by a digit (so
// "costs $5 and $10" stays text). \\$ escapes.
function inlineMath(state: StateInline, silent: boolean): boolean {
	const start = state.pos;
	const src = state.src;
	if (src.charCodeAt(start) !== 0x24 /* $ */) return false;
	if (src.charCodeAt(start + 1) === 0x24) return false; // $$ is block
	if (src[start + 1] === ' ' || src[start + 1] === '\t' || src[start + 1] === '\n') return false;

	let pos = start + 1;
	while (pos < src.length) {
		const ch = src.charCodeAt(pos);
		if (ch === 0x24 && src[pos - 1] !== '\\') {
			const prev = src[pos - 1];
			if (prev === ' ' || prev === '\t' || prev === '\n') {
				return false; // space before closing $ means currency
			}
			break;
		}
		if (ch === 0x0a) return false; // no newlines in inline math
		pos++;
	}
	if (pos >= src.length || src.charCodeAt(pos) !== 0x24) return false;
	// A digit after the closing $ is almost certainly a price: $5..$10
	if (/\d/.test(src[pos + 1] ?? '')) return false;

	const latex = src.slice(start + 1, pos);
	if (!latex) return false;
	if (!silent) {
		const token = state.push('html_inline', '', 0);
		token.content = `<span data-type="inline-math" data-latex="${esc(latex)}"></span>`;
	}
	state.pos = pos + 1;
	return true;
}

// Block math: $$...$$ on its own line(s). Single-line $$x$$ also works.
function blockMath(
	state: StateBlock,
	startLine: number,
	endLine: number,
	silent: boolean
): boolean {
	const start = state.bMarks[startLine] + state.tShift[startLine];
	const max = state.eMarks[startLine];
	if (state.src.slice(start, start + 2) !== '$$') return false;

	// Find the closing $$ - either on the same line after content, or on a
	// later line.
	const first = state.src.slice(start + 2, max);
	let latex: string;
	let lastLine = startLine;

	const sameLineEnd = first.indexOf('$$');
	if (sameLineEnd !== -1 && first.slice(sameLineEnd + 2).trim() === '') {
		latex = first.slice(0, sameLineEnd);
	} else {
		const parts = [first];
		let found = false;
		for (let line = startLine + 1; line < endLine; line++) {
			const ls = state.bMarks[line] + state.tShift[line];
			const le = state.eMarks[line];
			const text = state.src.slice(ls, le);
			const end = text.indexOf('$$');
			if (end !== -1 && text.slice(end + 2).trim() === '') {
				parts.push(text.slice(0, end));
				lastLine = line;
				found = true;
				break;
			}
			parts.push(text);
		}
		if (!found) return false;
		latex = parts.join('\n');
	}

	if (silent) return true;
	state.line = lastLine + 1;
	const token = state.push('html_block', '', 0);
	token.block = true;
	token.content = `<div data-type="block-math" data-latex="${esc(latex.trim())}"></div>\n`;
	token.map = [startLine, lastLine + 1];
	return true;
}

export function tactileMathPlugin(md: MarkdownIt): void {
	md.inline.ruler.after('escape', 'math_inline', inlineMath);
	md.block.ruler.before('fence', 'math_block', blockMath, {
		alt: ['paragraph', 'reference', 'blockquote', 'list']
	});
}

const mathMarkdownParse = {
	setup(markdownit: MarkdownIt) {
		markdownit.use(tactileMathPlugin);
	}
};

export const TactileInlineMath = InlineMath.extend({
	addStorage() {
		return {
			markdown: {
				serialize(state: { write: (s: string) => void }, node: { attrs: { latex: string } }) {
					state.write(`$${node.attrs.latex}$`);
				},
				parse: mathMarkdownParse
			}
		};
	}
});

export const TactileBlockMath = BlockMath.extend({
	addStorage() {
		return {
			markdown: {
				serialize(
					state: { write: (s: string) => void; closeBlock: (n: unknown) => void },
					node: { attrs: { latex: string } }
				) {
					state.write(`$$\n${node.attrs.latex}\n$$`);
					state.closeBlock(node);
				},
				parse: mathMarkdownParse
			}
		};
	}
});
