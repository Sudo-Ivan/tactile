<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	type Props = ContextMenuPrimitive.ItemProps & {
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

<ContextMenuPrimitive.Item
	bind:ref
	class={cn(
		'relative h-7 flex text-foreground cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
		inset && 'pl-8',
		className
	)}
	{...rest}
>
	{@render children?.()}
</ContextMenuPrimitive.Item>
