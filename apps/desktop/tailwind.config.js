// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharedConfig = require('@tactile/tailwind-config/tailwind.config.js');

module.exports = {
	presets: [sharedConfig],
	content: ['./src/**/*.{html,js,svelte,ts}', '../../packages/ui/**/*.{html,js,svelte,ts}']
};
