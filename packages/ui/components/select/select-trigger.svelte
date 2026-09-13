<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { ChevronsUpDown } from '@lucide/svelte';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...rest
	}: SelectPrimitive.TriggerProps = $props();
</script>

<SelectPrimitive.Trigger
	bind:ref
	class={cn(
		'flex h-7 w-fit gap-2.5 items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 text-xs shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
		className
	)}
	{...rest}
>
	{@render children?.()}
	<div>
		<ChevronsUpDown class="h-4 w-4 opacity-50" />
	</div>
</SelectPrimitive.Trigger>
