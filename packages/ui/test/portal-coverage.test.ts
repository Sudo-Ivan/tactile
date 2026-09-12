import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Regression guard for the context menu clipping bug: bits-ui renders
// floating content inline unless it is wrapped in a Portal. Unportaled
// content inside a scroll container gets clipped and can also lose the
// z-index fight. Every floating overlay wrapper in this package portals
// its own content; keep it that way.
const UI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENTS = join(UI_DIR, 'components');

// Directories whose *-content components render floating overlays. In-flow
// primitives (collapsible, tabs) are intentionally excluded.
const OVERLAY_DIRS = [
	'alert-dialog',
	'context-menu',
	'dialog',
	'dropdown-menu',
	'hover-card',
	'link-preview',
	'menubar',
	'navigation-menu',
	'popover',
	'select',
	'sheet',
	'tooltip'
];

function overlayContentFiles(): string[] {
	const out: string[] = [];
	for (const dir of OVERLAY_DIRS) {
		const abs = join(COMPONENTS, dir);
		let entries: string[];
		try {
			entries = readdirSync(abs);
		} catch {
			continue;
		}
		for (const file of entries) {
			if (/^.*-(content|sub-content)\.svelte$/.test(file) && !file.endsWith('-static.svelte')) {
				out.push(join(abs, file));
			}
		}
	}
	return out;
}

describe('portal coverage for floating overlays', () => {
	it('finds overlay content components', () => {
		expect(overlayContentFiles().length).toBeGreaterThan(0);
	});

	it('wraps every floating content in a Portal', () => {
		const offenders = overlayContentFiles().filter((file) => {
			const src = readFileSync(file, 'utf8');
			const rendersContent = /Primitive\.(Sub)?Content/.test(src) || /Primitive\.Overlay/.test(src);
			return rendersContent && !/Portal/.test(src);
		});
		expect(offenders).toEqual([]);
	});
});
