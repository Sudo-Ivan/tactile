// Lazy Mermaid rendering for code-block previews. The library is ~3 MB
// of chunks, so it only loads on first use; everything here is safe to
// call during SSR because the heavy import stays behind the dynamic
// boundary.

type MermaidModule = typeof import('mermaid');

let mermaidPromise: Promise<MermaidModule['default']> | null = null;
let renderId = 0;

function isDarkMode(): boolean {
	return document.documentElement.classList.contains('dark');
}

async function loadMermaid() {
	mermaidPromise ??= import('mermaid').then((m) => {
		m.default.initialize({
			startOnLoad: false,
			// strict: HTML in labels is encoded, click handlers disabled.
			securityLevel: 'strict',
			fontFamily: 'inherit'
		});
		return m.default;
	});
	return mermaidPromise;
}

// Render a diagram definition into the container. Errors are shown
// inline so a broken diagram never wedges the editor.
export async function renderMermaid(source: string, container: HTMLElement): Promise<void> {
	const text = source.trim();
	if (!text) {
		container.replaceChildren();
		return;
	}
	try {
		const mermaid = await loadMermaid();
		// Re-initialize with the right theme: mermaid caches config, and the
		// app can switch themes between renders.
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: 'strict',
			theme: isDarkMode() ? 'dark' : 'neutral',
			fontFamily: 'inherit'
		});
		const { svg } = await mermaid.render(`tt-mermaid-${renderId++}`, text);
		container.replaceChildren();
		const tpl = document.createElement('template');
		tpl.innerHTML = svg;
		container.appendChild(tpl.content);
	} catch (error) {
		container.replaceChildren();
		const err = document.createElement('div');
		err.className = 'tt-mermaid-error';
		err.textContent = error instanceof Error ? error.message : 'Failed to render diagram';
		container.appendChild(err);
	}
}
