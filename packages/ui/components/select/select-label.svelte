<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...rest
	}: SelectPrimitive.GroupHeadingProps = $props();
</script>

<SelectPrimitive.GroupHeading
	bind:ref
	class={cn('px-2 py-1.5 text-sm font-semibold', className)}
	{...rest}
>
	{@render children?.()}
</SelectPrimitive.GroupHeading>
