<script lang="ts">
	import { createNote } from '@tactile/core/api/notes';
	import EditorPage from '@tactile/core/components/notes/editor-page.svelte';
	import { appState } from '@/store.svelte';
</script>

<EditorPage
	emptyLabel="Select a note to start editing"
	createLabel="Create note"
	onCreate={() => createNote(appState.collection!)}
	sourceMode
/>
