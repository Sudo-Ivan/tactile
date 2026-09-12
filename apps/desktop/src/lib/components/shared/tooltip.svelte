<script lang="ts">
	import { appState } from '@/store.svelte';
	import type { ShortcutParams } from '@/types';
	import { shortcutToString } from '@/utils/keyboard';
	import * as Tooltip from '@tactile/ui/components/tooltip';
	import type { Snippet } from 'svelte';

	let {
		text = 'Tooltip',
		shortcut,
		children,
		...rest
	}: {
		text?: string;
		shortcut?: ShortcutParams;
		children?: Snippet;
		[key: string]: unknown;
	} = $props();

	// TODO: Find out why sometimes it needs refresh to work properly again after a while #BUG
</script>

<Tooltip.Root
	delayDuration={appState.tooltipsOpen >= 1 ? 0 : 300}
	onOpenChange={(open) => {
		if (open) {
			appState.tooltipsOpen += 1;
		} else {
			setTimeout(() => {
				appState.tooltipsOpen -= 1;
			}, 500);
		}
	}}
>
	<Tooltip.Trigger>{@render children?.()}</Tooltip.Trigger>
	<Tooltip.Content {...rest}>
		{text}
		{#if shortcut}
			<span
				class="pointer-events-none inline-flex h-[18px] pl-1.5 tracking-widest -mr-2 select-none items-center gap-1 rounded bg-muted px-1 font-mono font-medium text-foreground/70 opacity-100"
			>
				{shortcutToString(shortcut)}
			</span>
		{/if}
	</Tooltip.Content>
</Tooltip.Root>
