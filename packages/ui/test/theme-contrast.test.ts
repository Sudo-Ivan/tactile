import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// WCAG contrast checks on the semantic theme pairs in theme.css. Text on a
// surface (primary button text on primary button, body text on background)
// must stay readable in both themes. This catches invisible-text bugs at the
// token level instead of waiting for a screenshot.
const UI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(UI_DIR, 'theme.css'), 'utf8');

function parseVars(): Record<string, string> {
	const vars: Record<string, string> = {};
	for (const m of css.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
		vars[m[1]] = m[2].trim();
	}
	return vars;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	s /= 100;
	l /= 100;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	let r: number, g: number, b: number;
	if (h < 60) [r, g, b] = [c, x, 0];
	else if (h < 120) [r, g, b] = [x, c, 0];
	else if (h < 180) [r, g, b] = [0, c, x];
	else if (h < 240) [r, g, b] = [0, x, c];
	else if (h < 300) [r, g, b] = [x, 0, c];
	else [r, g, b] = [c, 0, x];
	return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function luminance([r, g, b]: [number, number, number]): number {
	const lin = (v: number) => {
		v /= 255;
		return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(a: string, b: string): number {
	const toRgb = (v: string) => {
		const [h, s, l] = v.split(/\s+/).map((n) => parseFloat(n));
		return hslToRgb(h, s, l);
	};
	const [l1, l2] = [luminance(toRgb(a)), luminance(toRgb(b))].sort((x, y) => y - x);
	return (l1 + 0.05) / (l2 + 0.05);
}

const vars = parseVars();

// foreground-on-surface pairs that must read as body/UI text in each theme.
// muted-on-muted is de-emphasized helper text by design (same palette as
// upstream shadcn); it only needs the AA large-text threshold of 3:1.
const PAIRS = [
	['background', 'foreground', 4.5],
	['secondary-background', 'foreground', 4.5],
	['card', 'card-foreground', 4.5],
	['popover', 'popover-foreground', 4.5],
	['primary', 'primary-foreground', 4.5],
	['secondary', 'secondary-foreground', 4.5],
	['accent', 'accent-foreground', 4.5],
	['destructive', 'destructive-foreground', 4.5],
	['muted', 'muted-foreground', 3.0]
] as const;

for (const theme of ['light', 'dark'] as const) {
	describe(`${theme} theme contrast`, () => {
		for (const [surface, text, min] of PAIRS) {
			it(`${text} on ${surface} meets its contrast floor (>= ${min})`, () => {
				const surfaceVar = vars[`${surface}-${theme}`];
				const textVar = vars[`${text}-${theme}`];
				expect(surfaceVar, `missing --${surface}-${theme}`).toBeTruthy();
				expect(textVar, `missing --${text}-${theme}`).toBeTruthy();
				const ratio = contrastRatio(surfaceVar, textVar);
				expect(
					ratio,
					`--${text}-${theme} on --${surface}-${theme}: ${ratio.toFixed(2)}:1`
				).toBeGreaterThanOrEqual(min);
			});
		}
	});
}
