<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';
	import { Check } from '@lucide/svelte';

	let {
		ref = $bindable(null),
		class: className,
		checked = $bindable(false),
		children: childrenProp,
		...rest
	}: ContextMenuPrimitive.CheckboxItemProps = $props();
</script>

<ContextMenuPrimitive.CheckboxItem
	bind:ref
	bind:checked
	class={cn(
		'relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
		className
	)}
	{...rest}
>
	{#snippet children(snippetProps)}
		<span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
			{#if snippetProps.checked}
				<Check class="h-4 w-4" />
			{/if}
		</span>
		{@render childrenProp?.(snippetProps)}
	{/snippet}
</ContextMenuPrimitive.CheckboxItem>
