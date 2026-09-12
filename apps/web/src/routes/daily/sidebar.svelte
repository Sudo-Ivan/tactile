<script lang="ts">
	import { openDailyNote } from '@tactile/core/actions/daily';
	import { sidebarResize } from '@tactile/core/actions/sidebar-resize';
	import { fetchCollectionEntries } from '@tactile/core/api/collection';
	import { dailyDir, ensureTodayDailyNote } from '@tactile/core/api/daily';
	import { openNote } from '@tactile/core/api/notes';
	import { subscribeCollectionChanges } from '@/storage';
	import { appState } from '@/store.svelte';
	import { dailyNoteDate } from '@tactile/core/utils/daily';
	import { Calendar } from '@tactile/ui/components/calendar';
	import Label from '@tactile/ui/components/label/label.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import { CalendarDate, getLocalTimeZone, today, type DateValue } from '@internationalized/date';
	import { onDestroy, untrack } from 'svelte';
	import Entries from './entries.svelte';

	let calValue = $state(today(getLocalTimeZone()));
	let stopWatching: (() => void) | undefined;

	const dailyDirPath = $derived(dailyDir(appState.collection ?? ''));

	// Watch for changes in the collection
	async function watchCollection() {
		return subscribeCollectionChanges(dailyDirPath, () => {
			fetchCollectionEntries(dailyDirPath);
		});
	}

	$effect(() => {
		const value = appState.collection;
		if (!value) return;

		untrack(async () => {
			const dir = dailyDir(value);
			const entries = await fetchCollectionEntries(dir);

			// Validate if there is a note for today
			const noteName = await ensureTodayDailyNote(dir, entries);

			// Open today's note
			openNote(`${dir}/${noteName}`, true);

			if (stopWatching) stopWatching();
			stopWatching = await watchCollection();
		});
	});

	// handle open calendar day
	const handleOpenCalendarDay = async (e: DateValue | undefined) => {
		await openDailyNote(e, dailyDirPath, appState.collectionEntries);
	};

	// Listen to activeFile change and update calendar value
	$effect(() => {
		// Extract date from the active file name
		const date = appState.activeFile ? dailyNoteDate(appState.activeFile) : undefined;
		if (!date || !date.year || !date.month || !date.day) return;

		// Update calendar value
		calValue = new CalendarDate(date.year, date.month, date.day);
	});

	onDestroy(() => {
		if (stopWatching) stopWatching();
	});
</script>

<div
	class={cn(
		'fixed left-12 h-[calc(100vh-4.5rem)] flex flex-col justify-start items-center bg-background overflow-y-auto transform transition-transform duration-300',
		!appState.isPageSidebarOpen && '-translate-x-52'
	)}
	style={`width: ${appState.pageSidebarWidth}px`}
>
	<!-- Drag border -->
	<div
		class="h-full w-1 border-r cursor-col-resize absolute top-0 right-0 z-10 hover:bg-foreground/10 hover:delay-75 transition-all duration-200 active:bg-foreground/20 active:!cursor-col-resize"
		use:sidebarResize={'page'}
		role="presentation"
	></div>

	<!-- Note Entries -->
	<div
		class="flex flex-col items-start gap-2 w-full h-full overflow-auto pt-2.5 px-2 pb-2"
		data-collection-root
		data-path={dailyDirPath}
	>
		{#if appState.collectionEntries.length === 0}
			<div class="w-full h-full flex flex-col gap-1 items-center justify-center">
				<Label class="text-muted-foreground text-xs text-center">No daily notes found</Label>
			</div>
		{:else}
			<Entries entries={appState.collectionEntries} />
		{/if}
	</div>

	<Calendar
		bind:value={calValue}
		class="border-t w-full"
		onValueChange={(e) => handleOpenCalendarDay(e)}
	/>
</div>

<style>
	:global(body.cursor-col-resize) {
		pointer-events: none;
	}
</style>
