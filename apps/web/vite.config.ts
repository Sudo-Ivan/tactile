import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), svelteTesting()],
	server: {
		forwardConsole: true
	},
	optimizeDeps: {
		exclude: ['@electric-sql/pglite']
	},
	test: {
		server: {
			deps: {
				// Packages shipping .svelte sources must be processed by the
				// svelte plugin rather than loaded as raw node modules.
				// Patterns match against resolved file paths, not specifiers.
				inline: [/node_modules\/(bits-ui|@tactile|lucide-svelte|mode-watcher|@internationalized)/]
			}
		}
	}
});
