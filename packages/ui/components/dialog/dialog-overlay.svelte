<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { cn } from '../../lib/utils';

	let { ref = $bindable(null), class: className, ...rest }: DialogPrimitive.OverlayProps = $props();
</script>

<DialogPrimitive.Overlay
	bind:ref
	class={cn('fixed inset-0 z-50 bg-background/80 backdrop-blur-sm ', className)}
	{...rest}
/>
