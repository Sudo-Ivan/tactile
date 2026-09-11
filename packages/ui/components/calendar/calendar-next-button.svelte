<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import { ChevronRight } from 'lucide-svelte';
	import { buttonVariants } from '../button/index';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...rest
	}: CalendarPrimitive.NextButtonProps = $props();
</script>

<CalendarPrimitive.NextButton
	bind:ref
	class={cn(
		buttonVariants({ variant: 'outline', scale: 'md' }),
		'h-[26px] w-[26px] bg-transparent p-0 opacity-50 hover:opacity-100',
		className
	)}
	{...rest}
>
	{#if children}
		{@render children()}
	{:else}
		<ChevronRight class="h-4 w-4" />
	{/if}
</CalendarPrimitive.NextButton>
