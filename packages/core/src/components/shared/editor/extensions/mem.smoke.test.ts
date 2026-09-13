// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { Markdown } from 'tiptap-markdown';
import { buildEditorExtensions } from './index';

// Memory smoke test: the full extension set must not retain dramatically
// more per editor create/destroy than a bare StarterKit+Markdown editor.
// happy-dom retains detached DOM, so the threshold is relative, not
// absolute.

const DOC = [
	'# Heading\n\nText with [[Other Note]] and [[a|alias]] and $x^2$ inline.\n',
	'$$\n\\int_0^1 x\\,dx\n$$\n',
	'```js\nconst a = 1\n```\n',
	'```mermaid\ngraph TD; A-->B\n```\n',
	'![pic](attachments/pic.png)\n\n- [ ] task\n'
]
	.join('\n')
	.repeat(10);

const gc = () => (globalThis as { gc?: () => void }).gc?.();

function measure(extensions: () => unknown[]): number {
	const make = () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		const e = new Editor({ element: el, extensions: extensions() as never, content: DOC });
		e.destroy();
		el.remove();
	};
	for (let i = 0; i < 5; i++) make();
	gc();
	const start = process.memoryUsage().heapUsed;
	for (let i = 0; i < 25; i++) make();
	gc();
	return (process.memoryUsage().heapUsed - start) / 25;
}

describe('memory smoke', () => {
	it('full extension set stays near baseline retention', () => {
		const baseline = measure(() => [StarterKit, Markdown]);
		const full = measure(buildEditorExtensions);
		console.log(
			`baseline: ${(baseline / 1024).toFixed(0)} KB/editor, full: ${(full / 1024).toFixed(0)} KB/editor`
		);
		// full adds nodeviews with real DOM (katex, mermaid preview,
		// attachment frames) which happy-dom retains; allow a wide margin.
		expect(full).toBeLessThan(baseline * 4 + 2 * 1024 * 1024);
	});
});
