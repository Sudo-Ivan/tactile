import markdownit from 'markdown-it';

// Render a markdown snippet (e.g. a search result preview) to HTML for
// {@html} display. Single shared instance; matches the options the task
// list used before.
export function renderMarkdownPreview(text: string): string {
	return markdownit({ html: true, linkify: true, typographer: true }).render(text);
}
