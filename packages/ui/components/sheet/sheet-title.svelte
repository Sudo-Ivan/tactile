<script lang="ts">
	import { Dialog as SheetPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...rest
	}: SheetPrimitive.TitleProps = $props();
</script>

<SheetPrimitive.Title bind:ref class={cn('text-lg text-foreground', className)} {...rest}>
	{@render children?.()}
</SheetPrimitive.Title>
