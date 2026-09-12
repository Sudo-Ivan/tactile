<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getCollections } from '$lib/api/collection';
	import Shortcut from '@/components/shared/shortcut.svelte';
	import { GITHUB_REPO_URL, GITHUB_SPONSOR_URL, ROUTES, SHORTCUTS } from '@/constants';
	import { dispatchShortcut, shortcutToString } from '@/utils/keyboard';
	import { open as browserOpen } from '@tauri-apps/plugin-shell';
	import { onMount } from 'svelte';

	const githubShortcut = { command: true, key: 'g' };
	const sponsorShortcut = { command: true, key: 's' };

	onMount(async () => {
		const hasCollections = (await getCollections()).length > 0;
		if (hasCollections) {
			goto(resolve(ROUTES.notes));
		}
	});
</script>

<div
	class="flex flex-col items-center justify-center w-full h-full min-h-screen bg-secondary-background"
>
	<div class="flex flex-col items-center gap-2">
		<p class="text-secondary-foreground/85">Open a collection to get started</p>
		<div class="flex gap-5">
			<button
				class="text-sm gap-1.5 flex text-muted-foreground hover:text-secondary-foreground transition-colors items-center justify-center"
				onclick={() => {
					dispatchShortcut('o');
				}}
			>
				<span
					class="pointer-events-none inline-flex h-[18px] pl-1.5 tracking-widest select-none items-center gap-1 rounded bg-secondary px-1 font-mono text-muted-foreground opacity-100"
				>
					{shortcutToString(SHORTCUTS['app:open-collection'])}
				</span>
				Open Collection</button
			>
			<button
				class="text-sm gap-1.5 flex text-muted-foreground hover:text-secondary-foreground transition-colors items-center justify-center"
				onclick={() => {
					browserOpen(GITHUB_REPO_URL);
				}}
			>
				<Shortcut options={githubShortcut} />
				<span
					class="pointer-events-none inline-flex h-[18px] pl-1.5 tracking-widest select-none items-center gap-1 rounded bg-secondary px-1 font-mono text-muted-foreground opacity-100"
				>
					{shortcutToString(githubShortcut)}
				</span>
				Star on GitHub
			</button>

			<button
				class="text-sm gap-1.5 flex text-muted-foreground hover:text-secondary-foreground transition-colors items-center justify-center"
				onclick={() => {
					browserOpen(GITHUB_SPONSOR_URL);
				}}
			>
				<Shortcut options={sponsorShortcut} />
				<span
					class="pointer-events-none inline-flex h-[18px] pl-1.5 tracking-widest select-none items-center gap-1 rounded bg-secondary px-1 font-mono text-muted-foreground opacity-100"
				>
					{shortcutToString(sponsorShortcut)}
				</span>
				Become a sponsor
			</button>
		</div>
	</div>
</div>
