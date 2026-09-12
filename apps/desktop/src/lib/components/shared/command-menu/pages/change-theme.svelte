<script lang="ts">
	import Icon from '$lib/components/shared/icon.svelte';
	import { appState } from '@/store.svelte';
	import * as Command from '@tactile/ui/components/command';

	let { onPageChange }: { onPageChange: (page: string | undefined) => void } = $props();

	const itemClass =
		'text-foreground/90 gap-3 [&>*]:text-foreground/90 [&>*]:aria-selected:text-foreground [&>*]:fill-foreground/50 [&>*]:aria-selected:fill-foreground';

	function selectTheme(theme: 'auto' | 'light' | 'dark') {
		appState.appTheme = theme;
		onPageChange(undefined);
	}
</script>

<Command.Group heading="Change theme...">
	{#if appState.appTheme !== 'light'}
		<Command.Item class={itemClass} value="light" onSelect={() => selectTheme('light')}>
			<Icon name="sun" />
			Light
		</Command.Item>
	{/if}
	{#if appState.appTheme !== 'dark'}
		<Command.Item class={itemClass} value="dark" onSelect={() => selectTheme('dark')}>
			<Icon name="moon" />
			Dark
		</Command.Item>
	{/if}
	{#if appState.appTheme !== 'auto'}
		<Command.Item class={itemClass} value="system" onSelect={() => selectTheme('auto')}>
			<Icon name="monitor" />
			System
		</Command.Item>
	{/if}
</Command.Group>
