import { SITE_URL } from '$lib/site';
import type { RequestHandler } from './$types';

export const prerender = true;

const PATHS = ['/', '/download', '/plans'];

export const GET: RequestHandler = () => {
	const urls = PATHS.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join('\n');
	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
		{ headers: { 'Content-Type': 'application/xml' } }
	);
};
