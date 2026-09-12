import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// The svelte plugin compiles .svelte.ts rune files (state modules) so tests
// can import them directly.
export default defineConfig({
	plugins: [svelte()]
});
