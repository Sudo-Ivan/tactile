// Regenerates the marketing screenshots used by the README, homepage and
// social cards. Run `pnpm build` first, then `pnpm screenshots`.
//
// Outputs:
//   .github/assets/tactile-dark.png      app in a macOS-style frame (dark)
//   .github/assets/tactile-light.png     app in a macOS-style frame (light)
//   apps/homepage/src/lib/assets/hero-dark.png   full-window app shot (dark, 4x)
//   apps/homepage/static/hero-dark.png           same file, static copy
// Note: rebuild homepage after regenerating its bundled hero asset.
//   apps/homepage/static/landing.png             homepage top fold (og:image)

import { createServer } from 'node:http';
import { copyFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8'
};

// Minimal static file server with SPA fallback and one extra route,
// /__frame, which renders the app inside a fake macOS window titlebar.
function serve(dir, { frameTarget = '/notes' } = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/__frame') {
      const theme = url.searchParams.get('theme') === 'light' ? 'light' : 'dark';
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(framePage(theme, frameTarget));
      return;
    }
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    let file = join(dir, path);
    if (!existsSync(file) || !file.startsWith(dir)) {
      // SPA fallback produced by adapter-static
      file = join(dir, '404.html');
    }
    try {
      const body = await readFile(file);
      res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

function framePage(theme, target) {
  const dark = theme === 'dark';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
		html,body{margin:0;height:100%;overflow:hidden}
		.bar{height:38px;display:flex;align-items:center;position:relative;
			background:${dark ? '#2c2c2e' : '#e8e8e8'};
			border-bottom:1px solid ${dark ? '#1a1a1a' : '#d0d0d0'}}
		.dot{position:absolute;top:14px;width:10px;height:10px;border-radius:50%}
		.title{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
			font:600 13px -apple-system,'SF Pro Text',system-ui,sans-serif;
			color:${dark ? '#e5e5e5' : '#3b3b3b'}}
		iframe{position:absolute;top:38px;left:0;width:100%;height:calc(100% - 38px);border:0}
	</style></head><body>
	<div class="bar">
		<span class="dot" style="left:12px;background:#ff5f57"></span>
		<span class="dot" style="left:30px;background:#febc2e"></span>
		<span class="dot" style="left:48px;background:#28c840"></span>
		<span class="title">Tactile</span>
	</div>
	<iframe src="${target}"></iframe>
</body></html>`;
}

async function openApp(page, { colorScheme = 'dark' } = {}) {
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
  await page.goto('/notes', { waitUntil: 'networkidle' });
  // First load seeds the default collection; wait for its entries.
  await page.getByText('README.md', { exact: true }).first().waitFor({ timeout: 60_000 });
  await page.getByText('README.md', { exact: true }).first().click();
  // Editor mounted when the seeded intro paragraph renders.
  await page.getByText('local-first', { exact: false }).first().waitFor({ timeout: 60_000 });
  // Let fonts settle and the debounced state calm down.
  await page.waitForTimeout(800);
}

async function openFramedApp(page, theme) {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.goto(`/__frame?theme=${theme}`, { waitUntil: 'load' });
  const frame = page.frameLocator('iframe');
  await frame.getByText('README.md', { exact: true }).first().waitFor({ timeout: 60_000 });
  await frame.getByText('README.md', { exact: true }).first().click();
  await frame.getByText('local-first', { exact: false }).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(800);
}

const webServer = await serve(join(ROOT, 'apps/web/build'));
const homeServer = await serve(join(ROOT, 'apps/homepage/build'));
const webBase = `http://127.0.0.1:${webServer.address().port}`;
const homeBase = `http://127.0.0.1:${homeServer.address().port}`;

const browser = await chromium.launch();

async function shot(name, base, path, width, height, scale, prep, out) {
  const ctx = await browser.newContext({
    baseURL: base,
    viewport: { width, height },
    deviceScaleFactor: scale
  });
  const page = await ctx.newPage();
  try {
    await prep(page);
    await page.screenshot({ path: join(ROOT, out) });
    console.log(`wrote ${out}`);
  } catch (error) {
    console.error(`FAILED ${name}: ${error.message}`);
    await page.screenshot({ path: join(ROOT, `scripts/.debug-${name}.png`) }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await ctx.close();
  }
}

try {
  await shot(
    'hero',
    webBase,
    '/notes',
    1921,
    1080,
    4,
    (p) => openApp(p, { colorScheme: 'dark' }),
    'apps/homepage/src/lib/assets/hero-dark.png'
  );
  await copyFile(
    join(ROOT, 'apps/homepage/src/lib/assets/hero-dark.png'),
    join(ROOT, 'apps/homepage/static/hero-dark.png')
  );
  await shot(
    'frame-dark',
    webBase,
    '/__frame?theme=dark',
    1408,
    1013,
    1,
    (p) => openFramedApp(p, 'dark'),
    '.github/assets/tactile-dark.png'
  );
  await shot(
    'frame-light',
    webBase,
    '/__frame?theme=light',
    1408,
    1013,
    1,
    (p) => openFramedApp(p, 'light'),
    '.github/assets/tactile-light.png'
  );
  await shot(
    'landing',
    homeBase,
    '/',
    1180,
    675,
    1,
    async (p) => {
      await p.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
      await p.goto('/', { waitUntil: 'networkidle' });
      await p.waitForTimeout(800);
    },
    'apps/homepage/static/landing.png'
  );
} finally {
  await browser.close();
  webServer.close();
  homeServer.close();
}
