<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...rest
	}: CalendarPrimitive.HeadCellProps = $props();
</script>

<CalendarPrimitive.HeadCell
	bind:ref
	class={cn('w-7 rounded-md text-[0.8rem] font-normal text-muted-foreground', className)}
	{...rest}
>
	{@render children?.()}
</CalendarPrimitive.HeadCell>
