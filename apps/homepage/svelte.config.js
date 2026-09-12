import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter(),
		// Base path for hosting under a subpath (e.g. /tactile on GitHub
		// Pages). Set PUBLIC_BASE_PATH at build time; empty means root.
		paths: {
			base: process.env.PUBLIC_BASE_PATH || ''
		}
	}
};

export default config;
