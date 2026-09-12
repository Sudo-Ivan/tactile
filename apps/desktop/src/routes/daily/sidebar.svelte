<script lang="ts">
	import { sidebarResize } from '@/actions/sidebar-resize';
	import { fetchCollectionEntries } from '@/api/collection';
	import { createNote, openNote } from '@/api/notes';
	import { DAILY_DIR, MARKDOWN_EXTENSION } from '@/constants';
	import { appState } from '@/store.svelte';
	import type { FileEntry } from '@/types';
	import { CalendarDate, getLocalTimeZone, today, type DateValue } from '@internationalized/date';
	import { Calendar } from '@tactile/ui/components/calendar';
	import Label from '@tactile/ui/components/label/label.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import type { UnlistenFn } from '@tauri-apps/api/event';
	import { watchImmediate } from '@tauri-apps/plugin-fs';
	import Entries from './entries.svelte';

	let calValue = $state(today(getLocalTimeZone()));
	let entries = $state<FileEntry[]>([]);
	let stopWatching: UnlistenFn | undefined;

	const dailyDir = $derived(`${appState.collection}/${DAILY_DIR}`);

	// Watch for changes in the collection
	async function watchCollection() {
		const unlisten = await watchImmediate(
			dailyDir,
			async () => {
				entries = await fetchCollectionEntries(dailyDir);
			},
			{ recursive: true }
		);

		return unlisten;
	}

	async function onCollectionChange(collectionPath: string | undefined) {
		entries = await fetchCollectionEntries(`${collectionPath}/${DAILY_DIR}`);

		// Validate if there is a note for today
		const today = new Date().toISOString().split('T')[0];
		const dailyExists = entries.some((entry) => entry.path.includes(today));

		if (!dailyExists) {
			await createNote(`${collectionPath}/${DAILY_DIR}`, today + MARKDOWN_EXTENSION);
		}

		// Open today's note
		openNote(`${collectionPath}/${DAILY_DIR}/${today}${MARKDOWN_EXTENSION}`, true);

		if (collectionPath) {
			if (stopWatching) stopWatching();
			stopWatching = await watchCollection();
		}
	}

	$effect(() => {
		const collectionPath = appState.collection;
		void onCollectionChange(collectionPath);

		return () => {
			stopWatching?.();
			stopWatching = undefined;
		};
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
		if (!entries.some((entry) => entry.path.includes(noteName))) {
			createNote(dailyDir, noteName);
		} else {
			openNote(`${dailyDir}/${noteName}`, true);
		}

		// Get note element by data-path
		let noteElement = document.querySelector(`[data-path="${dailyDir}/${noteName}"]`);

		// If note element is not found, wait for it to be rendered
		if (!noteElement) {
			await new Promise((resolve) => setTimeout(resolve, 150));
		}

		// Get note element again - this is because if the note is newly created, it might not be rendered yet
		noteElement = document.querySelector(`[data-path="${dailyDir}/${noteName}"]`);

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
		// Extract date string from active file path
		const dateString = appState.activeFile?.split('/').pop()?.split('.')[0];
		if (!dateString) return;

		// Parse date string
		const [year, month, day] = dateString.split('-').map(Number);
		if (!year || !month || !day) return;

		// Update calendar value
		calValue = new CalendarDate(year, month, day);
	});
</script>

<div
	class={cn(
		'fixed left-12 flex flex-col justify-start items-center bg-background overflow-y-auto transform transition-transform duration-300',
		!appState.isPageSidebarOpen && '-translate-x-52',
		appState.platform === 'darwin' ? 'h-[calc(100vh-4.5rem)]' : 'h-[calc(100vh-2.25rem)]'
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
		data-path={dailyDir}
	>
		{#if entries.length === 0}
			<div class="w-full h-full flex flex-col gap-1 items-center justify-center">
				<Label class="text-muted-foreground text-xs text-center">No daily notes found</Label>
			</div>
		{:else}
			<Entries {entries} />
		{/if}
	</div>

	<Calendar
		bind:value={calValue}
		class="border-t w-full"
		onValueChange={(e) => handleOpenCalendarDay(e)}
	/>
</div>
