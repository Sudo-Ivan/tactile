<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...rest
	}: CalendarPrimitive.HeaderProps = $props();
</script>

<CalendarPrimitive.Header
	bind:ref
	class={cn('relative flex w-full items-center justify-between pt-0.5', className)}
	{...rest}
>
	{@render children?.()}
</CalendarPrimitive.Header>
