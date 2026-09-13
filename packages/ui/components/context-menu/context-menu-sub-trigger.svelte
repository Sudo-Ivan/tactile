<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';
	import { ChevronRight } from '@lucide/svelte';

	type Props = ContextMenuPrimitive.SubTriggerProps & {
		inset?: boolean;
	};

	let {
		ref = $bindable(null),
		class: className,
		inset = undefined,
		children,
		...rest
	}: Props = $props();
</script>

<ContextMenuPrimitive.SubTrigger
	bind:ref
	class={cn(
		'flex cursor-pointer h-7 text-foreground select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
		inset && 'pl-8',
		className
	)}
	{...rest}
>
	{@render children?.()}
	<ChevronRight class="ml-auto h-4 w-4" />
</ContextMenuPrimitive.SubTrigger>
