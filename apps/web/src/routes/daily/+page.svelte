<script lang="ts">
	import { dailyDir, todayNoteName } from '@tactile/core/api/daily';
	import { createNote } from '@tactile/core/api/notes';
	import EditorPage from '@tactile/core/components/notes/editor-page.svelte';
	import { DAILY_NOTE_NAME_REGEX } from '@/constants';
	import { appState } from '@/store.svelte';
</script>

<EditorPage
	emptyLabel="Select a daily note to get started"
	createLabel="Create today's note"
	createShortcut={{ key: 'd', command: true }}
	onCreate={() => createNote(dailyDir(appState.collection!), todayNoteName())}
	preCheckRegex={DAILY_NOTE_NAME_REGEX}
	compactToolbar
/>
