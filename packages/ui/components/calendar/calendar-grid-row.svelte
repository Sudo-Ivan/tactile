<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...rest
	}: CalendarPrimitive.GridRowProps = $props();
</script>

<CalendarPrimitive.GridRow bind:ref class={cn('flex', className)} {...rest}>
	{@render children?.()}
</CalendarPrimitive.GridRow>
