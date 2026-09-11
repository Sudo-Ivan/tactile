<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...rest
	}: ContextMenuPrimitive.ContentProps = $props();
</script>

<ContextMenuPrimitive.Content
	bind:ref
	class={cn(
		'z-50 min-w-[8rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md focus:outline-none',
		className
	)}
	{...rest}
>
	{@render children?.()}
</ContextMenuPrimitive.Content>
