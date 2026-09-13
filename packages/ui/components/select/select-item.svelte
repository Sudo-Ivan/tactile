<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { Check } from '@lucide/svelte';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		value,
		label = undefined,
		disabled = undefined,
		children: childrenProp,
		...rest
	}: SelectPrimitive.ItemProps = $props();
</script>

<SelectPrimitive.Item
	bind:ref
	{value}
	{disabled}
	{label}
	class={cn(
		'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1 pl-2 pr-8 text-xs outline-none data-[disabled]:pointer-events-none text-secondary-foreground/85 data-[highlighted]:bg-accent data-[highlighted]:text-foreground data-[disabled]:opacity-50',
		className
	)}
	{...rest}
>
	{#snippet children({ selected, highlighted })}
		<span class="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
			{#if selected}
				<Check class="h-4 w-4" />
			{/if}
		</span>
		{#if childrenProp}
			{@render childrenProp({ selected, highlighted })}
		{:else}
			{label ? label : value}
		{/if}
	{/snippet}
</SelectPrimitive.Item>
