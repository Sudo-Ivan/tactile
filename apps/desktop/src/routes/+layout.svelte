<script lang="ts">
	import { restoreLatestCollection } from '@tactile/core/api/collection';
	import { loadSettings } from '@tactile/core/api/settings';
	import Footer from '@tactile/core/components/layout/footer.svelte';
	import Header from '@/components/layout/header.svelte';
	import MobileNav from '@/components/layout/mobile-nav.svelte';
	import Sidebar from '@tactile/core/components/layout/sidebar.svelte';
	import Command from '@tactile/core/components/shared/command-menu/command.svelte';
	import { isMobile } from '@/platform.svelte';
	import '@/storage';
	import { appState, setPlatform } from '@tactile/core/state';
	import { validateTactileFolder } from '@tactile/core/utils/files';
	import { updateWindowTheme } from '@/utils/theme';
	import '@tactile/ui/app.desktop.css';
	import { setTheme } from '@tauri-apps/api/app';
	import { platform as osPlatform } from '@tauri-apps/plugin-os';
	import { onMount, type Snippet } from 'svelte';

	let { children }: { children?: Snippet } = $props();

	// Prevent right-clicking in production
	// TODO: Test if this even works in production (not sure if tauri has access to env variables)
	if (process.env.NODE_ENV !== 'development') {
		document.addEventListener('contextmenu', (event) => event.preventDefault());
	}

	onMount(async () => {
		// Load latest collection on mount
		await restoreLatestCollection();

		// Validate tactile folder
		await validateTactileFolder(appState.collection!);

		// Load app & collection settings
		loadSettings(true, true);

		// Set platform
		setPlatform((await osPlatform()) as 'darwin' | 'linux' | 'windows');
	});

	// Keep local theme synced
	$effect(() => {
		const theme = appState.appTheme;

		// Update app theme, system maps to null which follows the OS theme
		// setTheme is desktop-only, mobile follows the system theme
		if (!isMobile) {
			void setTheme(theme === 'system' ? null : theme);
		}

		// Update window theme
		updateWindowTheme();
	});
</script>

<Command />

{#if isMobile}
	<main
		class="h-dvh w-full overflow-hidden bg-secondary-background pb-[calc(3.5rem_+_env(safe-area-inset-bottom))]"
	>
		{@render children?.()}
	</main>
	<MobileNav />
{:else}
	{#if appState.platform === 'darwin'}
		<Header />
	{/if}
	<Sidebar />
	<main class="flex min-h-screen w-full items-center justify-center">
		{@render children?.()}
	</main>
	<Footer />
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

	/* Sidebar drag-resize cursor */
	:global(body.cursor-col-resize) {
		cursor: col-resize !important;
		user-select: none !important;
		pointer-events: none;
	}
</style>
