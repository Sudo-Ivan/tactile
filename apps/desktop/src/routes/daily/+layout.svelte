<script lang="ts">
	import Layout from '@tactile/core/components/notes/layout.svelte';
	import type { Snippet } from 'svelte';
	import NotesSidebar from './sidebar.svelte';

	let { children }: { children?: Snippet } = $props();
</script>

<Layout sidebar={NotesSidebar}>
	{@render children?.()}
</Layout>
