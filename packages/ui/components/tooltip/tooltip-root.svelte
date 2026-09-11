<script lang="ts">
	import { Tooltip as TooltipPrimitive } from 'bits-ui';

	let { open = $bindable(false), children, ...rest }: TooltipPrimitive.RootProps = $props();
</script>

<TooltipPrimitive.Provider>
	<TooltipPrimitive.Root bind:open {children} {...rest} />
</TooltipPrimitive.Provider>
