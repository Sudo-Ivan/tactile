<script lang="ts">
	import { Collapsible as CollapsiblePrimitive } from 'bits-ui';

	let { ref = $bindable(null), children, ...rest }: CollapsiblePrimitive.ContentProps = $props();
</script>

<CollapsiblePrimitive.Content bind:ref {...rest}>
	{@render children?.()}
</CollapsiblePrimitive.Content>
