<script lang="ts">
	import { Separator as SeparatorPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let { ref = $bindable(null), class: className, ...rest }: SeparatorPrimitive.RootProps = $props();
</script>

<SeparatorPrimitive.Root bind:ref class={cn('-mx-1 my-1 h-px bg-muted', className)} {...rest} />
