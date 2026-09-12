<script lang="ts">
	import Icon from '$lib/components/shared/icon.svelte';
	import * as Command from '@tactile/ui/components/command';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import { commandItemClass } from './helpers';

	interface Props {
		onPageChange: (page: string | undefined) => void;
	}

	let { onPageChange }: Props = $props();
</script>

<Command.Group heading="Change theme...">
	{#if userPrefersMode.current !== 'light'}
		<Command.Item
			class={commandItemClass}
			value="light"
			onSelect={() => {
				setMode('light');
				onPageChange(undefined);
			}}
		>
			<Icon name="sun" />
			Light
		</Command.Item>
	{/if}
	{#if userPrefersMode.current !== 'dark'}
		<Command.Item
			class={commandItemClass}
			value="dark"
			onSelect={() => {
				setMode('dark');
				onPageChange(undefined);
			}}
		>
			<Icon name="moon" />
			Dark
		</Command.Item>
	{/if}
	{#if userPrefersMode.current !== 'system'}
		<Command.Item
			class={commandItemClass}
			value="system"
			onSelect={() => {
				setMode('system');
				onPageChange(undefined);
			}}
		>
			<Icon name="monitor" />
			System
		</Command.Item>
	{/if}
</Command.Group>
