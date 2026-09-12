import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			// SPA shell for unknown paths (GitHub Pages serves 404.html).
			fallback: '404.html'
		}),
		// Base path for hosting under a subpath (e.g. /tactile/app on
		// GitHub Pages). Set PUBLIC_BASE_PATH at build time; empty means root.
		paths: {
			base: process.env.PUBLIC_BASE_PATH || ''
		},
		alias: {
			'@/*': './src/lib'
		}
	}
};

export default config;
