<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		children,
		...rest
	}: SelectPrimitive.ContentProps = $props();
</script>

<SelectPrimitive.Portal>
	<SelectPrimitive.Content
		bind:ref
		{sideOffset}
		class={cn(
			'relative z-50 min-w-[8rem] w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md focus:outline-none',
			className
		)}
		{...rest}
	>
		<div class="w-full p-1">
			{@render children?.()}
		</div>
	</SelectPrimitive.Content>
</SelectPrimitive.Portal>
