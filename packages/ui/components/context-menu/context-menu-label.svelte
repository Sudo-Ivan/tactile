<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	type Props = ContextMenuPrimitive.GroupHeadingProps & {
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

<ContextMenuPrimitive.GroupHeading
	bind:ref
	class={cn('px-2 py-1.5 text-sm font-semibold text-foreground', inset && 'pl-8', className)}
	{...rest}
>
	{@render children?.()}
</ContextMenuPrimitive.GroupHeading>
