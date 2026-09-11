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

export {};
