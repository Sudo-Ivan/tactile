import { env } from '$env/dynamic/public';

// Canonical site URL for absolute links in meta tags and the sitemap.
// Set PUBLIC_SITE_URL when deploying; falls back to the repo in dev.
export const SITE_URL = (env.PUBLIC_SITE_URL || 'https://github.com/Sudo-Ivan/tactile').replace(
	/\/$/,
	''
);

export const SITE_NAME = 'Tactile';
export const SITE_TAGLINE = 'Write notes at the speed of touch';
export const SITE_DESCRIPTION =
	'Local-first, privacy-focused markdown notes. Minimal, lightweight and fast. Optional end-to-end encrypted sync with no accounts and no email.';

export const REPO_URL = 'https://github.com/Sudo-Ivan/tactile';
export const RELEASES_URL = `${REPO_URL}/releases`;

// Where "Open App" points. On the Pages deploy the web app sits under
// /app next to the homepage; falls back to the repo until it is hosted.
export const APP_URL = env.PUBLIC_APP_URL || (env.PUBLIC_SITE_URL ? `${SITE_URL}/app` : REPO_URL);
export const SPONSOR_URL = 'https://github.com/sponsors/Sudo-Ivan';
