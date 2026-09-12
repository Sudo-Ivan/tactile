<script lang="ts">
	import { TOOLTIP_GROUP_DELAY_MS } from '../../constants';
	import { appState } from '../../state/app.svelte';
	import type { ShortcutParams } from '../../types';
	import { shortcutToString } from '../../utils/keyboard';
	import * as Tooltip from '@tactile/ui/components/tooltip';
	import type { ComponentProps, Snippet } from 'svelte';

	interface Props extends ComponentProps<typeof Tooltip.Content> {
		text?: string;
		shortcut?: ShortcutParams;
		children?: Snippet;
	}

	let { text = 'Tooltip', shortcut, children, ...restProps }: Props = $props();

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
			}, TOOLTIP_GROUP_DELAY_MS);
		}
	}}
>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<!-- children already contain the interactive element; delegate the
			     trigger props to a span so we never emit button-in-button markup.
			     focus events do not bubble, so forward focusin to keep keyboard
			     focus opening the tooltip. -->
			<span
				{...props}
				onfocusin={props.onfocus as ((e: FocusEvent) => void) | undefined}
				class="inline-flex h-fit w-fit"
			>
				{@render children?.()}
			</span>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content {...restProps}>
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
