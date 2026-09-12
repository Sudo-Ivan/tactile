<script lang="ts">
	import Layout from '@tactile/core/components/notes/layout.svelte';
	import type { Snippet } from 'svelte';
	import TaskSidebar from './sidebar.svelte';

	let { children }: { children?: Snippet } = $props();
</script>

<Layout sidebar={TaskSidebar}>
	{@render children?.()}
</Layout>
