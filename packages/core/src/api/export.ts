import { MARKDOWN_EXTENSION } from '../constants';
import { platform } from '../platform';
import { appState } from '../state/app.svelte';
import { getStorage } from '../storage';
import { escapeHtml } from '../utils/fuzzy';
import { createZip, type ZipEntry } from '../utils/zip';
import { isInternalPath } from '@tactile/storage';
import markdownit from 'markdown-it';

// Recursively collect files under dirPath. Hidden segments (dotfiles,
// .tactile internals like trash and versions) are skipped except
// .tactile/daily which holds real user notes. When markdownOnly is set only
// .md files are returned.
async function collectFiles(dirPath: string, markdownOnly = true): Promise<string[]> {
	const storage = await getStorage();
	const files: string[] = [];

	const walk = async (dir: string): Promise<void> => {
		let entries;
		try {
			entries = await storage.readDir(dir);
		} catch {
			return;
		}
		for (const entry of entries) {
			const path = `${dir}/${entry.name}`.replace('//', '/');
			if (entry.isDirectory) {
				if (!entry.name.startsWith('.')) {
					await walk(path);
				} else if (entry.name === '.tactile') {
					await walk(`${path}/daily`);
				}
			} else if (
				entry.isFile &&
				(!markdownOnly || entry.name.toLowerCase().endsWith(MARKDOWN_EXTENSION)) &&
				!isInternalPath(path)
			) {
				files.push(path);
			}
		}
	};

	await walk(dirPath);
	return files;
}

function noteStem(path: string): string {
	return (path.split('/').pop() ?? 'note').replace(/\.md$/i, '');
}

// Save a single note as a .md file.
export async function exportNote(path: string): Promise<void> {
	const storage = await getStorage();
	const content = await storage.readTextFile(path);
	await platform().saveExport(`${noteStem(path)}.md`, content, 'text/markdown');
}

// Save the current editor selection as markdown. Falls back to plain text
// when the markdown serializer cannot handle the slice.
export async function exportSelection(): Promise<void> {
	const editor = appState.editor.instance;
	if (!editor || editor.state.selection.empty) return;

	const { from, to } = editor.state.selection;
	let content: string;
	try {
		const slice = editor.state.doc.slice(from, to);
		content = (
			editor.storage.markdown as unknown as {
				serializer: { serialize: (content: unknown) => string };
			}
		).serializer.serialize(slice.content);
	} catch {
		content = editor.state.doc.textBetween(from, to, '\n');
	}
	const stem = appState.activeFile ? noteStem(appState.activeFile) : 'selection';
	await platform().saveExport(`${stem} (selection).md`, content, 'text/markdown');
}

// Build a zip archive for a set of paths. entryName returns the archive
// path for each file.
async function zipPaths(
	paths: string[],
	entryName: (path: string) => string,
	archiveName: string
): Promise<void> {
	const storage = await getStorage();
	const entries: ZipEntry[] = [];
	for (const path of paths) {
		try {
			const data = await storage.readFile(path);
			const stat = await storage.stat(path).catch(() => null);
			entries.push({
				name: entryName(path),
				data,
				modified: stat?.mtime ?? undefined
			});
		} catch {
			// Unreadable file: skip rather than fail the whole export.
		}
	}
	if (entries.length === 0) return;
	await platform().saveExport(archiveName, createZip(entries), 'application/zip');
}

// Zip a folder (or any directory subtree) keeping its structure under the
// folder name.
export async function exportFolder(path: string): Promise<void> {
	const files = await collectFiles(path, false);
	if (files.length === 0) return;
	const parent = path.split('/').slice(0, -1).join('/');
	const prefix = parent === '/' || parent === '' ? '' : `${parent}/`;
	await zipPaths(
		files,
		(p) => (p.startsWith(prefix) ? p.slice(prefix.length) : p),
		`${noteStem(path)}.zip`
	);
}

// Zip every file in the open collection. All files (not just markdown) are
// included so attachments survive the round trip.
export async function exportCollection(): Promise<void> {
	const collection = appState.collection;
	if (!collection) return;
	const files = await collectFiles(collection, false);
	if (files.length === 0) return;
	const prefix = `${collection}/`;
	const name = collection.split('/').pop() || 'collection';
	await zipPaths(files, (p) => (p.startsWith(prefix) ? p.slice(prefix.length) : p), `${name}.zip`);
}

const PRINT_STYLES = `
	body { font-family: ui-serif, Georgia, serif; line-height: 1.6; color: #111; max-width: 44rem; margin: 2rem auto; padding: 0 1rem; }
	h1, h2, h3, h4, h5, h6 { font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.3; }
	h1 { border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
	code, pre { font-family: ui-monospace, monospace; font-size: 0.9em; }
	pre { background: #f5f5f5; padding: 0.8em; border-radius: 6px; overflow-x: auto; }
	code { background: #f5f5f5; padding: 0.1em 0.3em; border-radius: 4px; }
	pre code { background: none; padding: 0; }
	blockquote { border-left: 3px solid #ddd; margin-left: 0; padding-left: 1em; color: #555; }
	li[data-checked] { list-style: none; margin-left: -1.4em; }
	li[data-checked='true'] { text-decoration: line-through; color: #777; }
	li[data-checked] > div > p { display: inline; }
	li[data-checked] > label { display: none; }
	hr { border: none; border-top: 1px solid #ddd; }
	a { color: #555; }
	.tactile-note { page-break-after: always; }
	.tactile-note:last-child { page-break-after: auto; }
	.tactile-note-title { color: #888; font-family: ui-monospace, monospace; font-size: 0.85em; margin-bottom: 1.5rem; }
`;

// Render markdown blocks into a standalone printable HTML document. Each
// block becomes a section; a per-note path header is added when more than
// one note is included.
function renderPrintableDocument(blocks: { path: string; content: string }[]): {
	title: string;
	html: string;
} {
	const md = markdownit({ html: false, linkify: true, typographer: true });
	const multi = blocks.length > 1;

	const body = blocks
		.map(
			(block) => `<section class="tactile-note">
${multi ? `<div class="tactile-note-title">${escapeHtml(block.path.replace(appState.collection ?? '', ''))}</div>` : ''}
${md.render(block.content)}
</section>`
		)
		.join('\n');

	const title =
		blocks.length === 1
			? noteStem(blocks[0].path)
			: (appState.collection?.split('/').pop() ?? 'Notes');
	const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${PRINT_STYLES}</style>
</head>
<body>${body}</body>
</html>`;

	return { title, html };
}

// Open the printable document in a hidden iframe and trigger the browser
// print dialog (which offers save-as-PDF). Web only.
async function printBlocks(blocks: { path: string; content: string }[]): Promise<void> {
	const { html } = renderPrintableDocument(blocks);

	const iframe = document.createElement('iframe');
	iframe.style.position = 'fixed';
	iframe.style.right = '0';
	iframe.style.bottom = '0';
	iframe.style.width = '0';
	iframe.style.height = '0';
	iframe.style.border = '0';
	iframe.style.visibility = 'hidden';
	document.body.appendChild(iframe);

	const doc = iframe.contentDocument;
	if (!doc) {
		iframe.remove();
		return;
	}
	doc.open();
	doc.write(html);
	doc.close();

	const cleanup = () => iframe.remove();
	iframe.contentWindow?.addEventListener('afterprint', cleanup);
	// Fallback cleanup in case afterprint never fires.
	setTimeout(cleanup, 60_000);
	iframe.contentWindow?.focus();
	iframe.contentWindow?.print();
}

// Print a single note (the browser print dialog offers save-as-PDF).
export async function printNote(path: string): Promise<void> {
	const storage = await getStorage();
	const content = await storage.readTextFile(path);
	await printBlocks([{ path, content }]);
}

// Print every markdown note under a directory (folder or collection) as one
// document, with a page break between notes.
export async function printDirectory(path: string): Promise<void> {
	const storage = await getStorage();
	const files = await collectFiles(path, true);
	if (files.length === 0) return;
	const blocks: { path: string; content: string }[] = [];
	for (const file of files) {
		try {
			blocks.push({ path: file, content: await storage.readTextFile(file) });
		} catch {
			// Skip unreadable files.
		}
	}
	if (blocks.length > 0) await printBlocks(blocks);
}

// The desktop webview cannot print directly, so on desktop the same document
// is exported as a styled HTML file the user can open in a browser and print
// to PDF.
async function exportHtmlBlocks(
	blocks: { path: string; content: string }[],
	defaultName: string
): Promise<void> {
	const { html } = renderPrintableDocument(blocks);
	await platform().saveExport(defaultName, html, 'text/html');
}

// Save a note as printable HTML (open in a browser to print to PDF).
export async function exportNoteHtml(path: string): Promise<void> {
	const storage = await getStorage();
	const content = await storage.readTextFile(path);
	await exportHtmlBlocks([{ path, content }], `${noteStem(path)}.html`);
}

// Save every markdown note under a directory (folder or collection) as one
// printable HTML document, with a page break between notes.
export async function exportDirectoryHtml(path: string): Promise<void> {
	const storage = await getStorage();
	const files = await collectFiles(path, true);
	if (files.length === 0) return;
	const blocks: { path: string; content: string }[] = [];
	for (const file of files) {
		try {
			blocks.push({ path: file, content: await storage.readTextFile(file) });
		} catch {
			// Skip unreadable files.
		}
	}
	if (blocks.length === 0) return;
	const stem = path === appState.collection ? (path.split('/').pop() ?? 'notes') : noteStem(path);
	await exportHtmlBlocks(blocks, `${stem}.html`);
}
