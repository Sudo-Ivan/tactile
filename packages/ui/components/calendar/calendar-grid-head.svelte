<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...rest
	}: CalendarPrimitive.GridHeadProps = $props();
</script>

<CalendarPrimitive.GridHead bind:ref class={cn(className)} {...rest}>
	{@render children?.()}
</CalendarPrimitive.GridHead>
