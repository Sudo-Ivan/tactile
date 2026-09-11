<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { WithElementRef } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...rest
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	class={cn('mt-2 flex flex-col space-y-4 sm:flex-row sm:space-x-2 sm:space-y-0', className)}
	{...rest}
>
	{@render children?.()}
</div>
