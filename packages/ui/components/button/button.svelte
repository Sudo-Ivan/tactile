<script lang="ts">
	import { Button as ButtonPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';
	import { buttonVariants, type Props } from '.';

	let {
		ref = $bindable(null),
		class: className,
		variant = 'default',
		size = 'default',
		scale = undefined,
		type = 'button',
		href = undefined,
		disabled = undefined,
		children,
		...rest
	}: Props = $props();
</script>

{#if href}
	<ButtonPrimitive.Root
		bind:ref
		{href}
		{disabled}
		class={cn(buttonVariants({ variant, size, scale }), className)}
		{...rest}
	>
		{@render children?.()}
	</ButtonPrimitive.Root>
{:else}
	<ButtonPrimitive.Root
		bind:ref
		{type}
		{disabled}
		class={cn(buttonVariants({ variant, size, scale }), className)}
		{...rest}
	>
		{@render children?.()}
	</ButtonPrimitive.Root>
{/if}
