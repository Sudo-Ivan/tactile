<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { WithElementRef } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...rest
	}: WithElementRef<HTMLAttributes<HTMLSpanElement>, HTMLSpanElement> = $props();
</script>

<span
	bind:this={ref}
	class={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)}
	{...rest}
>
	{@render children?.()}
</span>
