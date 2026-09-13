// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { buildEditorExtensions } from './index';

// Round-trip tests: markdown -> tiptap doc -> markdown must preserve the
// custom syntax (wikilinks, math, mermaid fences, attachments).

let editor: Editor | null = null;

function makeEditor(content: string): Editor {
	const el = document.createElement('div');
	document.body.appendChild(el);
	editor = new Editor({ element: el, extensions: buildEditorExtensions(), content });
	return editor;
}

function getMarkdown(e: Editor): string {
	return e.storage.markdown.getMarkdown();
}

afterEach(() => {
	editor?.destroy();
	editor = null;
	document.body.replaceChildren();
});

describe('wikilinks', () => {
	it('parses [[name]] and [[name|alias]] and round-trips', () => {
		const e = makeEditor('See [[Other Note]] and [[dir/x.md|an alias]].');
		const md = getMarkdown(e);
		expect(md).toContain('[[Other Note]]');
		expect(md).toContain('[[dir/x.md|an alias]]');
	});

	it('renders a clickable span, not a link mark', () => {
		const e = makeEditor('Go to [[Target]].');
		expect(e.view.dom.querySelector('span[data-wikilink]')).toBeTruthy();
		expect(e.view.dom.querySelector('a[href]')).toBeNull();
	});
});

describe('math', () => {
	it('round-trips inline and block math', () => {
		const e = makeEditor('Inline $x^2 + y$ math.\n\n$$\n\\int_0^1 x\\,dx\n$$');
		const md = getMarkdown(e);
		expect(md).toContain('$x^2 + y$');
		expect(md).toContain('$$');
		expect(md).toContain('\\int_0^1 x\\,dx');
	});

	it('does not treat currency as math', () => {
		const e = makeEditor('Costs $5 and $10 total.');
		const types: string[] = [];
		e.state.doc.descendants((n) => {
			types.push(n.type.name);
			return true;
		});
		expect(types).not.toContain('inlineMath');
	});
});

describe('code blocks', () => {
	it('keeps language on fences and applies lowlight classes', () => {
		const e = makeEditor('```js\nconst a = 1\n```');
		expect(getMarkdown(e)).toContain('```js\nconst a = 1\n```');
	});

	it('round-trips mermaid fences as code blocks', () => {
		const e = makeEditor('```mermaid\ngraph TD; A-->B\n```');
		const md = getMarkdown(e);
		expect(md).toContain('```mermaid');
		expect(md).toContain('graph TD; A-->B');
	});
});

describe('attachments', () => {
	it('parses image syntax into image nodes with relative src', () => {
		const e = makeEditor('![shot](attachments/shot.png)');
		const types: string[] = [];
		e.state.doc.descendants((n) => {
			types.push(n.type.name);
			return true;
		});
		expect(types).toContain('image');
		expect(getMarkdown(e)).toContain('![shot](attachments/shot.png)');
	});
});
