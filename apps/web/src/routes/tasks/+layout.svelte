<script lang="ts">
	import type { Snippet } from 'svelte';
	import TaskSidebar from './sidebar.svelte';
	import Layout from '@tactile/core/components/notes/layout.svelte';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();
</script>

<svelte:head>
	<title>Tactile | Tasks</title>
</svelte:head>

<Layout sidebar={TaskSidebar}>
	{@render children?.()}
</Layout>
