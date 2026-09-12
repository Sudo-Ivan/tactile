<script lang="ts">
	import { sidebarResize } from '@/actions/sidebar-resize';
	import { fetchCollectionEntries } from '@/api/collection';
	import { createNote, openNote } from '@/api/notes';
	import { DAILY_NOTES_DIR, MARKDOWN_EXTENSION } from '@/constants';
	import { subscribeCollectionChanges } from '@/storage';
	import { appState } from '@/store.svelte';
	import { Calendar } from '@tactile/ui/components/calendar';
	import Label from '@tactile/ui/components/label/label.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import { CalendarDate, getLocalTimeZone, today, type DateValue } from '@internationalized/date';
	import { onDestroy, untrack } from 'svelte';
	import Entries from './entries.svelte';

	let calValue = $state(today(getLocalTimeZone()));
	let stopWatching: (() => void) | undefined;

	// Watch for changes in the collection
	async function watchCollection() {
		return subscribeCollectionChanges(appState.collection! + DAILY_NOTES_DIR, () => {
			fetchCollectionEntries(appState.collection! + DAILY_NOTES_DIR);
		});
	}

	$effect(() => {
		const value = appState.collection;
		if (!value) return;

		untrack(async () => {
			const entries = await fetchCollectionEntries(value + DAILY_NOTES_DIR);

			// Validate if there is a note for today
			const today = new Date().toISOString().split('T')[0];
			const dailyExists = entries.some((entry) => entry.path.includes(today));

			if (!dailyExists) {
				await createNote(value + DAILY_NOTES_DIR, today + MARKDOWN_EXTENSION);
			}

			// Open today's note
			openNote(value + DAILY_NOTES_DIR + '/' + today + MARKDOWN_EXTENSION, true);

			if (stopWatching) stopWatching();
			stopWatching = await watchCollection();
		});
	});

	// handle open calendar day
	const handleOpenCalendarDay = async (e: DateValue | undefined) => {
		if (!e) return;

		// Pad the month and day with a leading zero if they're single digits
		const paddedMonth = e.month.toString().padStart(2, '0');
		const paddedDay = e.day.toString().padStart(2, '0');

		// Create the note name with padded month and day
		const noteName = `${e.year}-${paddedMonth}-${paddedDay}${MARKDOWN_EXTENSION}`;

		// Check if note exists, if not create it - else open it
		if (!appState.collectionEntries.some((entry) => entry.path.includes(noteName))) {
			createNote(appState.collection + DAILY_NOTES_DIR, noteName);
		} else {
			openNote(appState.collection + DAILY_NOTES_DIR + '/' + noteName, true);
		}

		// Get note element by data-path
		let noteElement = document.querySelector(
			`[data-path="${appState.collection}${DAILY_NOTES_DIR}/${noteName}"]`
		);

		// If note element is not found, wait for it to be rendered
		if (!noteElement) {
			await new Promise((resolve) => setTimeout(resolve, 150));
		}

		// Get note element again - this is because if the note is newly created, it might not be rendered yet
		noteElement = document.querySelector(
			`[data-path="${appState.collection}${DAILY_NOTES_DIR}/${noteName}"]`
		);

		// Scroll to note element
		if (noteElement) {
			const rect = noteElement.getBoundingClientRect();
			const isAboveView = rect.top < 0;
			const isBelowView = rect.bottom > window.innerHeight;
			if (isAboveView || isBelowView) {
				// Smooth scroll doesn't seem to work well from bottom to top
				const behavior = isAboveView ? 'auto' : 'smooth';
				noteElement.scrollIntoView({ behavior, block: 'center' });
			}
		}
	};

	// Listen to activeFile change and update calendar value
	$effect(() => {
		const value = appState.activeFile;

		// Extract date string from active file path
		const dateString = value?.split('/').pop()?.split('.')[0];
		if (!dateString) return;

		// Parse date string
		const [year, month, day] = dateString.split('-').map(Number);
		if (!year || !month || !day) return;

		// Update calendar value
		calValue = new CalendarDate(year, month, day);
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
		data-path={appState.collection + DAILY_NOTES_DIR}
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
		/* cursor: col-resize !important;
		user-select: none !important; */
		pointer-events: none;
	}
</style>
