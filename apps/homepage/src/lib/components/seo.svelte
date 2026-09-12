<script lang="ts">
	import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '$lib/site';

	let {
		title = `${SITE_NAME} - ${'Local-first markdown notes'}`,
		description = SITE_DESCRIPTION,
		path = '/'
	}: { title?: string; description?: string; path?: string } = $props();

	const url = $derived(`${SITE_URL}${path}`);
	const image = `${SITE_URL}/landing.png`;
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />

	<!-- Open Graph -->
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:locale" content="en" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={url} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={image} />
	<meta property="og:image:alt" content="Tactile - markdown notes" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="627" />

	<!-- Twitter -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:url" content={url} />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={image} />
</svelte:head>
