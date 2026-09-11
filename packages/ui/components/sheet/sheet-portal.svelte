<script lang="ts">
	import { Dialog as SheetPrimitive } from 'bits-ui';

	let { children, ...rest }: SheetPrimitive.PortalProps = $props();
</script>

<SheetPrimitive.Portal {...rest}>
	{@render children?.()}
</SheetPrimitive.Portal>
