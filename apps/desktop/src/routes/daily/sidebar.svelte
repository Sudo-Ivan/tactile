<script lang="ts">
	import { openDailyNote } from '@tactile/core/actions/daily';
	import { sidebarResize } from '@tactile/core/actions/sidebar-resize';
	import { fetchCollectionEntries } from '@tactile/core/api/collection';
	import { dailyDir as dailyDirPath, ensureTodayDailyNote } from '@tactile/core/api/daily';
	import { closeNote, openNote } from '@tactile/core/api/notes';
	import { isMobile } from '@/platform.svelte';
	import { appState } from '@/store.svelte';
	import type { FileEntry } from '@/types';
	import { dailyNoteDate } from '@tactile/core/utils/daily';
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

	const dailyDir = $derived(dailyDirPath(appState.collection ?? ''));

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
		const dir = dailyDirPath(collectionPath ?? '');
		entries = await fetchCollectionEntries(dir);

		// Validate if there is a note for today
		const noteName = await ensureTodayDailyNote(dir, entries);

		// Open today's note. On mobile stay on the entry list instead
		if (isMobile) {
			closeNote();
		} else {
			openNote(`${dir}/${noteName}`, true);
		}

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
		await openDailyNote(e, dailyDir, entries);
	};

	// Listen to activeFile change and update calendar value
	$effect(() => {
		// Extract date from the active file name
		const date = appState.activeFile ? dailyNoteDate(appState.activeFile) : undefined;
		if (!date || !date.year || !date.month || !date.day) return;

		// Update calendar value
		calValue = new CalendarDate(date.year, date.month, date.day);
	});
</script>

<div
	class={cn(
		'fixed flex flex-col justify-start items-center bg-background overflow-y-auto transform transition-transform duration-300',
		isMobile
			? 'left-0 top-0 w-full z-30 bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))]'
			: cn(
					'left-12',
					!appState.isPageSidebarOpen && '-translate-x-52',
					appState.platform === 'darwin' ? 'h-[calc(100vh-4.5rem)]' : 'h-[calc(100vh-2.25rem)]'
				)
	)}
	style={isMobile ? undefined : `width: ${appState.pageSidebarWidth}px`}
>
	<!-- Drag border -->
	{#if !isMobile}
		<div
			class="h-full w-1 border-r cursor-col-resize absolute top-0 right-0 z-10 hover:bg-foreground/10 hover:delay-75 transition-all duration-200 active:bg-foreground/20 active:!cursor-col-resize"
			use:sidebarResize={'page'}
			role="presentation"
		></div>
	{/if}

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
