import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compile } from 'tailwindcss';

// Guard against the class of bug where a utility is used in this package but
// never emitted because Tailwind does not scan the package source. Every
// literal class token under components/ and lib/ must produce a rule when the
// shared stylesheet is compiled.
const UI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(UI_DIR, 'package.json'));

// Classes that are deliberately not Tailwind utilities (plain CSS rules).
const CUSTOM_CLASSES = new Set<string>(['prose-theme']);

// Single-word utilities with no '-', '[' or '/' to identify them by.
const SINGLETONS = new Set([
	'flex',
	'grid',
	'hidden',
	'block',
	'inline',
	'contents',
	'static',
	'fixed',
	'absolute',
	'relative',
	'sticky',
	'visible',
	'invisible',
	'collapse',
	'italic',
	'truncate',
	'underline',
	'overline',
	'uppercase',
	'lowercase',
	'capitalize',
	'antialiased',
	'shadow',
	'resize',
	'grow',
	'shrink',
	'transform',
	'border',
	'rounded',
	'container',
	'isolate',
	'flex-row',
	'sr-only'
]);

function filesRecursive(dir: string, exts: string[]): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...filesRecursive(path, exts));
		else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(path);
	}
	return out;
}

// Find fnName( ... ) call bodies using balanced parens.
function callBodies(src: string, names: string[]): string[] {
	const out: string[] = [];
	for (const name of names) {
		let i = 0;
		while ((i = src.indexOf(`${name}(`, i)) !== -1) {
			let depth = 0;
			let j = i + name.length;
			for (; j < src.length; j++) {
				if (src[j] === '(') depth++;
				else if (src[j] === ')') {
					depth--;
					if (depth === 0) break;
				}
			}
			out.push(src.slice(i + name.length, j + 1));
			i = j + 1;
		}
	}
	return out;
}

function quotedTokens(src: string): string[] {
	const out: string[] = [];
	for (const m of src.matchAll(/["'`]([^"'`]+)["'`]/g)) {
		out.push(...m[1].split(/\s+/));
	}
	return out.filter(Boolean);
}

// Pull literal class tokens from a file. Svelte: class="..." attributes,
// class={...} expressions and cn() calls. TS: cn()/tv() call bodies only,
// since other quoted strings are import paths or type literals.
function extractCandidates(file: string): string[] {
	const src = readFileSync(file, 'utf8');
	const out: string[] = [];

	for (const m of src.matchAll(/\bclass\s*=\s*["'`]([^"'`]+)["'`]/g)) {
		out.push(...m[1].split(/\s+/));
	}
	// class={ ... } regions: take everything up to the closing brace that
	// ends the expression, then pull quoted literals out of it.
	for (const m of src.matchAll(/\bclass\s*=\s*\{/g)) {
		let depth = 0;
		let j = m.index! + m[0].length - 1;
		for (; j < src.length; j++) {
			if (src[j] === '{') depth++;
			else if (src[j] === '}') {
				depth--;
				if (depth === 0) break;
			}
		}
		out.push(...quotedTokens(src.slice(m.index!, j + 1)));
	}
	for (const body of callBodies(src, ['cn', 'tv', 'clsx', 'twMerge'])) {
		out.push(...quotedTokens(body));
	}
	return out;
}

// Keep tokens that could plausibly be a utility class.
function isUtilityToken(token: string): boolean {
	if (CUSTOM_CLASSES.has(token)) return false;
	if (token.length < 2) return false;
	if (!/[a-z]/.test(token)) return false; // numbers, paths, fragments
	if (!/^[a-zA-Z0-9!&-]/.test(token)) return false;
	if (token.includes('./') || token.includes('://')) return false; // paths
	if (!/^[a-zA-Z0-9\-:.,[\]()/%'!$#~^&*_{}]+$/.test(token)) return false;
	return token.includes('-') || token.includes('[') || token.includes('/') || SINGLETONS.has(token);
}

// Escape a candidate the way Tailwind escapes selectors.
function escapeSelector(cls: string): string {
	return cls.replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
}

// Resolve a bare CSS import to its stylesheet entry. Node's resolver ignores
// the 'style' export condition, so it may hand back a .js file or refuse the
// package.json subpath entirely. Walk node_modules dirs and read the manifest
// from disk instead.
function resolveStylePackage(id: string, base: string): string {
	const dirs = [base, UI_DIR, dirname(base), dirname(UI_DIR)];
	for (const dir of dirs) {
		const pkgPath = join(dir, 'node_modules', id, 'package.json');
		try {
			const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
			const entry = pkg.exports?.['.']?.style ?? pkg.style ?? pkg.main;
			if (entry) {
				const resolved = join(dirname(pkgPath), entry);
				if (resolved.endsWith('.css')) return resolved;
			}
		} catch {
			// try next dir
		}
	}
	return require.resolve(id, { paths: [base, UI_DIR] });
}

async function buildCss() {
	const css = readFileSync(join(UI_DIR, 'app.web.css'), 'utf8');
	return compile(css, {
		base: UI_DIR,
		loadStylesheet: async (id: string, base: string) => {
			let path: string;
			if (id.startsWith('@tactile/tailwind-config')) {
				path = resolve(UI_DIR, '../config-tailwind', id.split('/').pop()!);
			} else if (id.startsWith('.') || id.startsWith('/')) {
				path = resolve(base, id);
			} else {
				path = resolveStylePackage(id, base);
			}
			return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
		},
		loadModule: async (id: string, base: string) => {
			const path = require.resolve(id, { paths: [base, UI_DIR] });
			return { path, base: dirname(path), module: require(path) };
		}
	});
}

const candidates = new Set<string>();
for (const dir of ['components', 'lib']) {
	for (const file of filesRecursive(join(UI_DIR, dir), ['.svelte', '.ts'])) {
		for (const token of extractCandidates(file)) {
			if (isUtilityToken(token)) candidates.add(token);
		}
	}
}

describe('ui package class coverage', () => {
	it('collects a sane number of candidates', () => {
		expect(candidates.size).toBeGreaterThan(50);
	});

	it('emits a rule for every class token used in the package', async () => {
		const compiled = await buildCss();
		const built = compiled.build([...candidates]);

		const missing = [...candidates].filter((token) => !built.includes('.' + escapeSelector(token)));
		expect(missing).toEqual([]);
	});
});
