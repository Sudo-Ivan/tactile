import { common, createLowlight } from 'lowlight';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import type { Editor } from '@tiptap/core';
import type { NodeView, ViewMutationRecord } from '@tiptap/pm/view';
import type { Node } from '@tiptap/pm/model';
import { renderMermaid } from './mermaid';

export const lowlight = createLowlight(common);

// Code block with syntax highlighting plus a live Mermaid preview under
// ```mermaid fences. The node stays a plain codeBlock so markdown
// round-trips untouched.
const MERMAID_LANG = 'mermaid';

class CodeBlockView implements NodeView {
	dom: HTMLElement;
	contentDOM: HTMLElement;
	private preview: HTMLDivElement;
	private label: HTMLSpanElement;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private renderSeq = 0;

	constructor(
		private node: Node,
		private editor: Editor
	) {
		this.dom = document.createElement('div');
		this.dom.classList.add('tt-code-block');
		this.dom.setAttribute('data-language', node.attrs.language ?? '');

		this.label = document.createElement('span');
		this.label.className = 'tt-code-lang';
		this.label.contentEditable = 'false';
		this.dom.appendChild(this.label);

		const pre = document.createElement('pre');
		const code = document.createElement('code');
		pre.appendChild(code);
		this.dom.appendChild(pre);
		this.contentDOM = code;

		this.preview = document.createElement('div');
		this.preview.className = 'tt-mermaid-preview';
		this.preview.contentEditable = 'false';
		this.dom.appendChild(this.preview);

		this.sync(node);
	}

	private sync(node: Node) {
		const lang = (node.attrs.language as string | null) ?? '';
		this.label.textContent = lang;
		this.label.style.display = lang ? '' : 'none';
		this.dom.setAttribute('data-language', lang);
		if (lang === MERMAID_LANG) {
			this.scheduleRender(node);
		} else {
			this.preview.style.display = 'none';
			this.preview.replaceChildren();
		}
	}

	private scheduleRender(node: Node) {
		if (this.timer) clearTimeout(this.timer);
		const seq = ++this.renderSeq;
		this.timer = setTimeout(() => {
			if (seq !== this.renderSeq) return;
			this.preview.style.display = '';
			void renderMermaid(node.textContent, this.preview);
		}, 300);
	}

	update(node: Node) {
		if (node.type !== this.node.type) return false;
		const lang = (node.attrs.language as string | null) ?? '';
		const prevLang = (this.node.attrs.language as string | null) ?? '';
		const isMermaid = lang === MERMAID_LANG;
		const textChanged = node.textContent !== this.node.textContent;
		this.node = node;
		if (lang !== prevLang) {
			this.sync(node);
		} else if (isMermaid && textChanged) {
			this.scheduleRender(node);
		}
		return true;
	}

	ignoreMutation(mutation: ViewMutationRecord) {
		// The preview and language label are outside contentDOM.
		return !this.contentDOM.contains(mutation.target);
	}

	destroy() {
		if (this.timer) clearTimeout(this.timer);
	}
}

export const TactileCodeBlock = CodeBlockLowlight.extend({
	addNodeView() {
		return ({ node, editor }) => new CodeBlockView(node, editor);
	}
}).configure({
	lowlight,
	defaultLanguage: null,
	languageClassPrefix: 'language-'
});
