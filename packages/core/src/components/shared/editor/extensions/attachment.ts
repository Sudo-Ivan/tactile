import { Image } from '@tiptap/extension-image';
import type { NodeView } from '@tiptap/pm/view';
import type { Node } from '@tiptap/pm/model';
import {
	acquireAttachmentUrl,
	attachmentKind,
	isExternalSrc,
	releaseAttachmentUrl
} from '../../../../api/attachments';

// Attachment rendering. The node stays the standard `image` node so
// markdown serialization remains ![alt](src); the nodeview swaps in a
// styled img/video/audio/file preview and resolves collection-relative
// paths to blob URLs through the storage backend.

function basename(src: string): string {
	return src.split('/').pop() ?? src;
}

class AttachmentView implements NodeView {
	dom: HTMLElement;
	private media: HTMLMediaElement | HTMLImageElement | HTMLAnchorElement | null = null;
	private loadedSrc: string | null = null;

	constructor(private node: Node) {
		this.dom = document.createElement('div');
		this.build(node);
	}

	private build(node: Node) {
		// Release the previous blob URL before rendering a different src.
		if (this.loadedSrc) {
			releaseAttachmentUrl(this.loadedSrc);
			this.loadedSrc = null;
		}
		const src: string = node.attrs.src ?? '';
		const alt: string = node.attrs.alt ?? '';
		const kind = attachmentKind(src);
		const label = alt || basename(src);

		this.dom.className = `tt-attachment tt-attachment-${kind}`;
		this.dom.setAttribute('data-attachment', kind);
		this.dom.replaceChildren();
		this.media = null;

		switch (kind) {
			case 'image': {
				const img = document.createElement('img');
				img.alt = label;
				img.loading = 'lazy';
				this.dom.appendChild(img);
				this.media = img;
				break;
			}
			case 'video':
			case 'audio': {
				const frame = document.createElement('div');
				frame.className = 'tt-media-frame';
				const head = document.createElement('div');
				head.className = 'tt-media-head';
				head.textContent = label;
				const media = document.createElement(kind);
				media.controls = true;
				media.preload = 'metadata';
				if (kind === 'video') {
					(media as HTMLVideoElement).playsInline = true;
				}
				frame.appendChild(head);
				frame.appendChild(media);
				this.dom.appendChild(frame);
				this.media = media;
				break;
			}
			default: {
				const card = document.createElement('a');
				card.className = 'tt-file-card';
				card.download = basename(src);
				card.title = 'Download ' + label;
				const icon = document.createElement('span');
				icon.className = 'tt-file-icon';
				icon.innerHTML =
					'<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 3H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8z"/><path d="M11 3v5h5"/></svg>';
				const name = document.createElement('span');
				name.className = 'tt-file-name';
				name.textContent = label;
				card.appendChild(icon);
				card.appendChild(name);
				this.dom.appendChild(card);
				this.media = card;
				break;
			}
		}

		this.load(src);
	}

	private async load(src: string) {
		const el = this.media;
		if (!el || !src) return;
		// Remote URLs render directly; local paths go through storage.
		if (isExternalSrc(src)) {
			if (el instanceof HTMLAnchorElement) el.href = src;
			else el.src = src;
			return;
		}
		this.loadedSrc = src;
		try {
			const url = await acquireAttachmentUrl(src);
			if (!this.dom.isConnected) return;
			if (el instanceof HTMLAnchorElement) el.href = url;
			else el.src = url;
		} catch {
			this.dom.replaceChildren();
			const missing = document.createElement('div');
			missing.className = 'tt-attachment-missing';
			missing.textContent = `Missing attachment: ${src}`;
			this.dom.appendChild(missing);
		}
	}

	update(node: Node) {
		if (node.type !== this.node.type) return false;
		const changed =
			node.attrs.src !== this.node.attrs.src || node.attrs.alt !== this.node.attrs.alt;
		this.node = node;
		if (changed) this.build(node);
		return true;
	}

	destroy() {
		if (this.loadedSrc) {
			releaseAttachmentUrl(this.loadedSrc);
			this.loadedSrc = null;
		}
		if (this.media instanceof HTMLMediaElement) {
			this.media.pause();
			this.media.removeAttribute('src');
			this.media.load();
		}
	}
}

export const Attachment = Image.extend({
	draggable: true,
	addNodeView() {
		return ({ node }) => new AttachmentView(node);
	}
});
