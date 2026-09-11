<script lang="ts">
	import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		value = $bindable(''),
		children,
		...rest
	}: ContextMenuPrimitive.RadioGroupProps = $props();
</script>

<ContextMenuPrimitive.RadioGroup bind:ref bind:value {...rest}>
	{@render children?.()}
</ContextMenuPrimitive.RadioGroup>
