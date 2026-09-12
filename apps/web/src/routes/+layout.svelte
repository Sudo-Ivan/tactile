<script lang="ts">
	import { restoreLatestCollection } from '@tactile/core/api/collection';
	import { loadSettings } from '@tactile/core/api/settings';
	import Footer from '@tactile/core/components/layout/footer.svelte';
	import Header from '@/components/layout/header.svelte';
	import Sidebar from '@tactile/core/components/layout/sidebar.svelte';
	import Command from '@tactile/core/components/shared/command-menu/command.svelte';
	import Icon from '@tactile/core/components/shared/icon.svelte';
	import { initStorage } from '@/storage';
	import { createDeviceDetector } from '@/utils';
	import '@tactile/ui/app.web.css';
	import { ModeWatcher } from 'mode-watcher';
	import { Loader } from 'lucide-svelte';
	import { onMount, type Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();

	// Device detector
	const device = createDeviceDetector();

	// Storage bootstrap state. The app cannot render until collections are
	// readable, so block on init rather than flash a broken UI.
	let storageState = $state<'loading' | 'ready' | 'error'>('loading');
	let storageError = $state<string>('');

	onMount(async () => {
		// Storage init runs format check, PGlite migration and seeding.
		try {
			await initStorage();
			storageState = 'ready';
		} catch (error) {
			console.error('storage: init failed', error);
			storageError = error instanceof Error ? error.message : String(error);
			storageState = 'error';
			return;
		}

		// Load latest collection on mount
		await restoreLatestCollection();

		// Load app & collection settings
		loadSettings(true, true);
	});
</script>

<svelte:head>
	<title>Tactile</title>
	<meta
		name="description"
		content="Tactile is a new local-first & privacy-focused home for your markdown notes. It's a minimalistic, lightweight and fast note-taking app that's designed to be distraction-free."
	/>
	<meta
		name="keywords"
		content="Tactile, Note-taking, Markdown, Local-first, Privacy-focused, Open-source, Online Markdown Editor, Fast Note-taking, Minimalistic Design"
	/>
	<meta name="author" content="Tactile" />
	<meta name="robots" content="index, follow" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="theme-color" content="#0F0F0F" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

	<!-- Open Graph -->
	<meta property="og:site_name" content="Tactile" />
	<meta property="og:locale" content="en" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://github.com/Sudo-Ivan/tactile/" />
	<meta property="og:title" content="Tactile - Write Notes at the speed of touch" />
	<meta
		property="og:description"
		content="Tactile is a new local-first & privacy-focused home for your markdown notes. It's a minimalistic, lightweight and fast note-taking app that's designed to be distraction-free."
	/>
	<meta property="og:image" content="https://github.com/Sudo-Ivan/tactile/landing.png" />
	<meta property="og:image:alt" content="Tactile - Markdown Editor" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="627" />

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content="https://github.com/Sudo-Ivan/tactile/" />
	<meta property="twitter:title" content="Tactile - Write Notes at the speed of touch" />
	<meta
		property="twitter:description"
		content="Tactile is a new local-first & privacy-focused home for your markdown notes. It's a minimalistic, lightweight and fast note-taking app that's designed to be distraction-free."
	/>
	<meta property="twitter:image" content="https://github.com/Sudo-Ivan/tactile/landing.png" />
</svelte:head>

{#if storageState === 'loading'}
	<main class="flex min-h-screen w-full items-center justify-center">
		<div class="flex flex-col items-center gap-2">
			<Loader class="w-5 h-5 animate-spin text-muted-foreground" />
			<p class="text-sm text-muted-foreground">Loading your notes...</p>
		</div>
	</main>
{:else if storageState === 'error'}
	<main class="flex min-h-screen w-full items-center justify-center">
		<div class="flex flex-col items-center gap-2 text-center max-w-md">
			<Icon name="cloudX" class="w-9 h-9 fill-none text-destructive" />
			<h1 class="text-secondary-foreground">Storage could not be initialized</h1>
			<p class="text-muted-foreground text-sm leading-relaxed">{storageError}</p>
		</div>
	</main>
{:else if device.isDesktop}
	<Command />
	<ModeWatcher />
	<Header />
	<Sidebar />
	<main class="flex min-h-screen w-full items-center justify-center">
		{@render children?.()}
	</main>
	<Footer />
{:else}
	<main class="flex min-h-[100dvh] w-full flex-col items-center justify-center gap-5">
		<Icon name="phoneOff" class="w-9 h-9 fill-none text-secondary-foreground" />
		<div class="flex flex-col text-center gap-2">
			<h1 class="text-secondary-foreground">Seems like you're on mobile</h1>
			<p class="text-muted-foreground text-sm leading-relaxed">
				Tactile isn't yet supported on mobile devices.<br />Please try again on a desktop.
			</p>
		</div>
	</main>
{/if}

<style>
	/* Custom scrollbar */
	:global(::-webkit-scrollbar) {
		width: 14px;
	}

	:global(::-webkit-scrollbar-thumb) {
		border: 4px solid rgba(0, 0, 0, 0);
		background-clip: padding-box;
		border-radius: 50px;
		background-color: hsl(var(--border) / 1);

		&:hover {
			background-color: hsl(var(--foreground) / 0.15);
		}
	}
</style>
