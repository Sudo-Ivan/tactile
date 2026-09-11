<script lang="ts">
	import { Command as CommandPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	type Props = CommandPrimitive.GroupProps & {
		heading?: string;
	};

	let {
		ref = $bindable(null),
		class: className,
		heading = undefined,
		children,
		...rest
	}: Props = $props();
</script>

<CommandPrimitive.Group
	bind:ref
	class={cn(
		'overflow-hidden p-0 text-foreground [&_[data-command-group-heading]]:px-2 [&_[data-command-group-heading]]:py-1.5 [&_[data-command-group-heading]]:text-xs [&_[data-command-group-heading]]:font-medium [&_[data-command-group-heading]]:text-muted-foreground',
		className
	)}
	{...rest}
>
	{#if heading}
		<CommandPrimitive.GroupHeading>{heading}</CommandPrimitive.GroupHeading>
	{/if}
	{@render children?.()}
</CommandPrimitive.Group>
