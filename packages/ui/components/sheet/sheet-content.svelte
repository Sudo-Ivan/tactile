<script lang="ts">
	import { Dialog as SheetPrimitive } from 'bits-ui';
	import { X } from '@lucide/svelte';
	import { SheetOverlay, SheetPortal, type Side, sheetVariants } from './index.js';
	import { cn } from '../../lib/utils';

	type Props = SheetPrimitive.ContentProps & {
		side?: Side;
	};

	let {
		ref = $bindable(null),
		class: className,
		side = 'right',
		children,
		...rest
	}: Props = $props();
</script>

<SheetPortal>
	<SheetOverlay />
	<SheetPrimitive.Content bind:ref class={cn(sheetVariants({ side }), className)} {...rest}>
		{@render children?.()}
		<SheetPrimitive.Close
			class="absolute right-5 top-5 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary"
		>
			<X class="h-4 w-4" />
			<span class="sr-only">Close</span>
		</SheetPrimitive.Close>
	</SheetPrimitive.Content>
</SheetPortal>
