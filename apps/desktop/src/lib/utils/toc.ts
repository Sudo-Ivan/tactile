import type { NodePos } from '@tiptap/core';

export interface TocItem {
	text: string;
	indent: number;
}

// Flatten heading nodes into table of contents items with relative indentation
export function calculateTocItems(headings: NodePos[]): TocItem[] {
	const minLevel = Math.min(...headings.map((h) => h.attributes.level));
	return headings.map((heading) => ({
		text: heading.textContent,
		indent: Math.max(0, heading.attributes.level - minLevel)
	}));
}
