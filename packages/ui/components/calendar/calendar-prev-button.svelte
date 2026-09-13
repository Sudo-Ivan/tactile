<script lang="ts">
	import { Calendar as CalendarPrimitive } from 'bits-ui';
	import { ChevronLeft } from '@lucide/svelte';
	import { buttonVariants } from '../button/index';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...rest
	}: CalendarPrimitive.PrevButtonProps = $props();
</script>

<CalendarPrimitive.PrevButton
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
		<ChevronLeft class="h-3.5 w-3.5" />
	{/if}
</CalendarPrimitive.PrevButton>
