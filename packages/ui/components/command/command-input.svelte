<script lang="ts">
	import { Command as CommandPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let {
		ref = $bindable(null),
		class: className,
		value = $bindable(''),
		...rest
	}: CommandPrimitive.InputProps = $props();
</script>

<div class="flex items-center border-b px-3" data-command-input-wrapper="">
	<CommandPrimitive.Input
		bind:ref
		bind:value
		class={cn(
			'flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
			className
		)}
		{...rest}
	/>
</div>
