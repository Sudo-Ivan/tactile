// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
import type { SearchAndReplaceStorage } from '$lib/components/shared/editor/extensions/searchAndReplace';
import type { MarkdownStorage } from 'tiptap-markdown';

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

declare module '@tiptap/core' {
	interface Storage {
		markdown: MarkdownStorage;
		searchAndReplace: SearchAndReplaceStorage;
	}
}

declare module 'svelte/elements' {
	interface HTMLAttributes<T extends EventTarget> {
		// Fired by the longpress action on touch devices
		onlongpress?: (event: CustomEvent<{ x: number; y: number }> & { currentTarget: T }) => void;
	}
}

export {};
