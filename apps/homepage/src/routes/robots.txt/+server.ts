import { SITE_URL } from '$lib/site';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	new Response(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, {
		headers: { 'Content-Type': 'text/plain' }
	});
