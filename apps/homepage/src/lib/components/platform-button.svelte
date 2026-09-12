<script lang="ts">
	import { cn } from '@tactile/ui/lib/utils';
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	let {
		name,
		active = false,
		children,
		...rest
	}: { name: string; active?: boolean; children?: Snippet } & HTMLButtonAttributes = $props();
</script>

<button
	id={`pb-${name}`}
	class={cn(
		'm-2 inline-flex shrink-0 h-[120px] w-[124px] grow flex-col items-center justify-center rounded-xl border border-transparent text-center opacity-50 transition-opacity',
		active ? 'border-border bg-secondary-background  !opacity-100' : 'hover:bg-secondary/45'
	)}
	{...rest}
>
	<div
		class="mb-4 flex shrink-0 rounded-xl border border-foreground/25 bg-secondary-background p-4"
	>
		{@render children?.()}
	</div>
	<div class="text-sm leading-tight text-secondary-foreground">{name}</div>
</button>
