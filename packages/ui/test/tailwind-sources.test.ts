import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Regression guard for the production styling break where classes used in
// @tactile/core were missing from built CSS: Tailwind v4 does not scan
// workspace packages automatically, every source of class markup must be
// declared with an explicit @source in base.css.
const UI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_CSS = join(UI_DIR, 'base.css');

function sourceDirs(): string[] {
	const css = readFileSync(BASE_CSS, 'utf8');
	return [...css.matchAll(/@source\s+["']([^"']+)["']/g)].map((m) => resolve(UI_DIR, m[1]));
}

function isCovered(dir: string, sources: string[]): boolean {
	return sources.some((s) => dir === s || dir.startsWith(s + sep));
}

// Directories whose markup feeds the shared stylesheet. ui/components and
// ui/lib hold the primitives, ../core/src holds the shared app components.
const REQUIRED = [join(UI_DIR, 'components'), join(UI_DIR, 'lib'), resolve(UI_DIR, '../core/src')];

describe('tailwind @source coverage', () => {
	it('declares at least one @source', () => {
		expect(sourceDirs().length).toBeGreaterThan(0);
	});

	it('every declared @source resolves to an existing directory', () => {
		for (const dir of sourceDirs()) {
			let exists = true;
			try {
				readdirSync(dir);
			} catch {
				exists = false;
			}
			expect(exists, `@source ${dir} does not exist`).toBe(true);
		}
	});

	it('covers every directory that contributes utility classes', () => {
		const sources = sourceDirs();
		for (const dir of REQUIRED) {
			expect(isCovered(dir, sources), `${dir} is not under any @source`).toBe(true);
		}
	});
});
