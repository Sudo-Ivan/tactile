<script lang="ts">
	import Command from './command.svelte';
	import * as Dialog from '../dialog';
	import type { Dialog as DialogPrimitive, Command as CommandPrimitive } from 'bits-ui';

	type Props = DialogPrimitive.RootProps & CommandPrimitive.RootProps;

	let { open = $bindable(false), value = $bindable(), children, ...rest }: Props = $props();
</script>

<Dialog.Root bind:open {...rest}>
	<Dialog.Content class="overflow-hidden p-0 !w-[518px] top-[15%]">
		<Command
			class="[&_[data-command-group-heading]]:px-2 [&_[data-command-group-heading]]:font-medium [&_[data-command-group-heading]]:text-muted-foreground [&_[data-command-group]:not([hidden])_~[data-command-group]]:pt-0 [&_[data-command-group]]:px-2 [&_[data-command-input-wrapper]_svg]:h-5 [&_[data-command-input-wrapper]_svg]:w-5 [&_[data-command-input]]:h-12 [&_[data-command-item]]:px-4 [&_[data-command-item]]:py-3 [&_[data-command-item]_svg]:h-4 [&_[data-command-item]_svg]:w-4"
			{...rest}
			bind:value
		>
			{@render children?.()}
		</Command>
	</Dialog.Content>
</Dialog.Root>
