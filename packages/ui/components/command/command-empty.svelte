<script lang="ts">
	import { Command as CommandPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...rest
	}: CommandPrimitive.EmptyProps = $props();
</script>

<CommandPrimitive.Empty bind:ref class={cn('py-6 text-center text-sm', className)} {...rest}>
	{@render children?.()}
</CommandPrimitive.Empty>
