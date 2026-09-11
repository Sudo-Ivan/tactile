<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...rest
	}: CalendarPrimitive.GridProps = $props();
</script>

<CalendarPrimitive.Grid
	bind:ref
	class={cn(
		'w-full flex flex-col items-center justify-center border-collapse space-y-1',
		className
	)}
	{...rest}
>
	{@render children?.()}
</CalendarPrimitive.Grid>
