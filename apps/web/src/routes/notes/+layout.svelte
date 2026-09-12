<script lang="ts">
	import type { Snippet } from 'svelte';
	import NotesSidebar from './sidebar.svelte';
	import Layout from '$lib/components/notes/layout.svelte';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();
</script>

<svelte:head>
	<title>Tactile | Notes</title>
</svelte:head>

<Layout sidebar={NotesSidebar}>
	{@render children?.()}
</Layout>
