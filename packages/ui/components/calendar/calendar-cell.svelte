<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		date,
		month,
		class: className,
		children,
		...rest
	}: CalendarPrimitive.CellProps = $props();
</script>

<CalendarPrimitive.Cell
	{date}
	{month}
	bind:ref
	class={cn(
		'relative h-7 w-7 p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([data-selected])]:rounded-md [&:has([data-selected])]:bg-accent [&:has([data-selected][data-outside-month])]:bg-accent/50',
		className
	)}
	{...rest}
	{children}
/>
