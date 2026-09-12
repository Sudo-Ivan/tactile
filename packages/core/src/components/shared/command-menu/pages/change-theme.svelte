<script lang="ts">
	import Icon from '../../icon.svelte';
	import { commandItemClass } from '../../../../commands';
	import { setThemeMode, themeMode } from '../../../../platform';
	import type { ThemeMode } from '../../../../types';
	import * as Command from '@tactile/ui/components/command';

	let { onPageChange }: { onPageChange: (page: string | undefined) => void } = $props();

	function selectTheme(theme: ThemeMode) {
		setThemeMode(theme);
		onPageChange(undefined);
	}
</script>

<Command.Group heading="Change theme...">
	{#if themeMode() !== 'light'}
		<Command.Item class={commandItemClass} value="light" onSelect={() => selectTheme('light')}>
			<Icon name="sun" />
			Light
		</Command.Item>
	{/if}
	{#if themeMode() !== 'dark'}
		<Command.Item class={commandItemClass} value="dark" onSelect={() => selectTheme('dark')}>
			<Icon name="moon" />
			Dark
		</Command.Item>
	{/if}
	{#if themeMode() !== 'system'}
		<Command.Item class={commandItemClass} value="system" onSelect={() => selectTheme('system')}>
			<Icon name="monitor" />
			System
		</Command.Item>
	{/if}
</Command.Group>
