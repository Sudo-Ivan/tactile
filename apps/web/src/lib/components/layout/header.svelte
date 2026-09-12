<script lang="ts">
	import { appState } from '$lib/store.svelte';
	import { GITHUB_URL } from '@/constants';
	import Button from '@tactile/ui/components/button/button.svelte';
</script>

<header
	class="absolute top-0 w-full flex justify-between items-center h-9 border-b pl-20 bg-background z-40 px-1.5"
>
	<div></div>
	<p
		class="pointer-events-none text-sm text-foreground/85 hover:text-foreground/100 transition-all cursor-default outline-none -mr-[159px]"
	>
		{appState.collection?.split('/').pop() || ''}
	</p>
	<div class="flex gap-1">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="{GITHUB_URL}/releases" target="_blank" rel="noopener noreferrer">
			<Button size="sm" scale="sm" class="rounded-full h-[27px] px-2.5">Download</Button>
		</a>
	</div>
</header>
