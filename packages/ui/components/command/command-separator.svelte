<script lang="ts">
	import { Command as CommandPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		...rest
	}: CommandPrimitive.SeparatorProps = $props();
</script>

<CommandPrimitive.Separator bind:ref class={cn('-mx-1 h-px bg-border', className)} {...rest} />
