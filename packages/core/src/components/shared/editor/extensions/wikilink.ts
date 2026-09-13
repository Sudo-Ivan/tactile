import { mergeAttributes, Node } from '@tiptap/core';
import type { MarkdownIt, StateInline } from 'markdown-it';

// [[wikilink]] support: an inline atom node stored in markdown as
// [[Note Name]] or [[Note Name|alias]] (Obsidian-compatible). Clicking
// is wired at the editor level via data-wikilink on the rendered anchor.

const esc = (s: string): string =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wikilinkRule(state: StateInline, silent: boolean): boolean {
	const src = state.src;
	const start = state.pos;
	if (src.charCodeAt(start) !== 0x5b || src.charCodeAt(start + 1) !== 0x5b) return false; // [[
	const end = src.indexOf(']]', start + 2);
	if (end === -1) return false;
	const inner = src.slice(start + 2, end);
	if (!inner || inner.includes('\n')) return false;

	const pipe = inner.indexOf('|');
	const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
	const label = (pipe === -1 ? '' : inner.slice(pipe + 1).trim()) || target;
	if (!target) return false;

	if (!silent) {
		const token = state.push('html_inline', '', 0);
		token.content = `<span data-wikilink data-target="${esc(target)}">${esc(label)}</span>`;
	}
	state.pos = end + 2;
	return true;
}

export function wikilinkPlugin(md: MarkdownIt): void {
	md.inline.ruler.push('wikilink', wikilinkRule);
}

export const WikiLink = Node.create({
	name: 'wikilink',
	group: 'inline',
	inline: true,
	atom: true,

	addAttributes() {
		return {
			target: {
				default: '',
				parseHTML: (el) => el.getAttribute('data-target'),
				renderHTML: (attrs) => ({ 'data-target': attrs.target })
			},
			label: {
				default: '',
				parseHTML: (el) => el.textContent ?? '',
				// label is rendered as the anchor's text content
				renderHTML: () => ({})
			}
		};
	},

	parseHTML() {
		return [{ tag: 'span[data-wikilink]' }];
	},

	renderHTML({ node, HTMLAttributes }) {
		const label = node.attrs.label || node.attrs.target;
		return [
			'span',
			mergeAttributes(HTMLAttributes, {
				'data-wikilink': '',
				'data-target': node.attrs.target,
				role: 'link',
				class: 'tt-wikilink'
			}),
			label
		];
	},

	addStorage() {
		return {
			markdown: {
				serialize(
					state: { write: (s: string) => void },
					node: {
						attrs: { target: string; label: string };
					}
				) {
					const { target, label } = node.attrs;
					state.write(`[[${target}${label && label !== target ? `|${label}` : ''}]]`);
				},
				parse: {
					setup(markdownit: MarkdownIt) {
						markdownit.use(wikilinkPlugin);
					}
				}
			}
		};
	}
});
