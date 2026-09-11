<script lang="ts">
	import { Tooltip as TooltipPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		children,
		...rest
	}: TooltipPrimitive.ContentProps = $props();
</script>

<TooltipPrimitive.Portal>
	<TooltipPrimitive.Content
		bind:ref
		{sideOffset}
		class={cn(
			'flex items-center justify-center border z-50 rounded-md bg-secondary h-6',
			className
		)}
		{...rest}
	>
		<TooltipPrimitive.Arrow class="bg-primary rounded-[1.5px] border" />
		<div
			class={cn(
				'flex items-center gap-1.5 justify-center w-full h-full px-2.5 z-50 bg-secondary text-xs text-secondary-foreground rounded-md',
				className
			)}
		>
			{@render children?.()}
		</div>
	</TooltipPrimitive.Content>
</TooltipPrimitive.Portal>
