import type { RequestHandler } from './$types';

type UpdateResponse = {
	version: string;
	pub_date?: string;
	url: string;
	signature: string;
	notes?: string;
};

type Target = 'linux' | 'windows' | 'darwin';
type Arch = 'x86_64' | 'i686' | 'aarch64' | 'armv7';

const REPO = 'Sudo-Ivan/tactile';

async function getLatestRelease(): Promise<{ tag_name: string; body?: string }> {
	const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
		headers: {
			Accept: 'application/vnd.github+json',
			'User-Agent': 'tactile-homepage'
		}
	});
	if (!response.ok) {
		throw new Error(`GitHub API responded with ${response.status}`);
	}
	return await response.json();
}

export const GET: RequestHandler = async ({ url }) => {
	// Params
	const currentVersion = url.searchParams.get('currentVersion');
	const target = url.searchParams.get('target') as Target | undefined;
	const arch = url.searchParams.get('arch') as Arch | undefined;

	// Parse target and arch and validate with type
	if (!target || !arch || !currentVersion) {
		return new Response(
			JSON.stringify({
				error: 'Missing required parameters. Please provide target, arch, and currentVersion.'
			}),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	// Validate target
	if (!['linux', 'windows', 'darwin'].includes(target)) {
		return new Response(
			JSON.stringify({
				error: 'Invalid target. Must be linux, windows, or darwin.'
			}),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	// Validate arch
	if (!['x86_64', 'i686', 'aarch64', 'armv7'].includes(arch)) {
		return new Response(
			JSON.stringify({
				error: 'Invalid arch. Must be x86_64, i686, aarch64, or armv7.'
			}),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	// Get latest version info from GitHub releases
	const release = await getLatestRelease();
	const latestVersion = release.tag_name;
	const notes = release.body;

	// Validate versions
	if (currentVersion.replace('v', '') === latestVersion.replace('v', '')) {
		return new Response(null, { status: 204 });
	}

	const baseUrl = `https://github.com/${REPO}/releases/download/${latestVersion}`;

	const platforms: Record<string, { signature: string; url: string }> = {
		'darwin-x86_64': {
			signature: await fetchSignature(`${baseUrl}/Tactile_x64.app.tar.gz.sig`),
			url: `${baseUrl}/Tactile_x64.app.tar.gz`
		},
		'darwin-aarch64': {
			signature: await fetchSignature(`${baseUrl}/Tactile_aarch64.app.tar.gz.sig`),
			url: `${baseUrl}/Tactile_aarch64.app.tar.gz`
		}
		//? Not available yet
		// 'linux-x86_64': {
		// 	signature: await fetchSignature(`${baseUrl}/Tactile_${version}_amd64.AppImage.tar.gz.sig`),
		// 	url: `${baseUrl}/Tactile_${version}_amd64.AppImage.tar.gz`
		// },
		// 'windows-x86_64': {
		// 	signature: await fetchSignature(`${baseUrl}/Tactile_${version}_x64-setup.nsis.zip.sig`),
		// 	url: `${baseUrl}/Tactile_${version}_x64-setup.nsis.zip`
		// }
	};

	const updateResponse: UpdateResponse = {
		version: latestVersion,
		notes,
		pub_date: new Date().toISOString(),
		url: platforms[`${target}-${arch}`]?.url ?? '',
		signature: platforms[`${target}-${arch}`]?.signature ?? ''
	};

	return new Response(JSON.stringify(updateResponse), { status: 200 });
};

async function fetchSignature(url: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) {
		console.error(`Failed to fetch signature from ${url}`);
		return '';
	}
	return await response.text();
}
