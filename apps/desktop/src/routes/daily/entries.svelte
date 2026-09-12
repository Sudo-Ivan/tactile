<script lang="ts">
	import { deleteNote, openNote } from '@/api/notes';
	import Icon from '@/components/shared/icon.svelte';
	import Shortcut from '@/components/shared/shortcut.svelte';
	import { SHORTCUTS } from '@/constants';
	import { appState } from '@/store.svelte';
	import type { FileEntry } from '@/types';
	import { fileManagerLabel, showInFolder } from '@/utils/fs';
	import { shortcutToString } from '@/utils/keyboard';
	import Button from '@tactile/ui/components/button/button.svelte';
	import * as ContextMenu from '@tactile/ui/components/context-menu';
	import Label from '@tactile/ui/components/label/label.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import { SvelteDate } from 'svelte/reactivity';

	let { entries }: { entries: FileEntry[] } = $props();

	function entryDate(entry: FileEntry) {
		const [year, month, day] = entry.path.split('/').pop()!.split('.')[0].split('-').map(Number);
		return new SvelteDate(year, month - 1, day);
	}

	function groupEntries(entries: FileEntry[]): Record<string, FileEntry[]> {
		const now = new SvelteDate();
		const today = new SvelteDate(now.getFullYear(), now.getMonth(), now.getDate());
		const yesterday = new SvelteDate(today);
		yesterday.setDate(yesterday.getDate() - 1);
		const thisWeekStart = new SvelteDate(today);
		thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
		const thisMonthStart = new SvelteDate(now.getFullYear(), now.getMonth(), 1);

		const grouped: Record<string, FileEntry[]> = {
			upcoming: [],
			today: [],
			yesterday: [],
			thisWeek: [],
			thisMonth: [],
			older: []
		};

		entries.forEach((entry) => {
			const [year, month, day] = entry.path.split('/').pop()!.split('.')[0].split('-').map(Number);

			if (isNaN(year) || isNaN(month) || isNaN(day)) {
				// If the file name doesn't match the expected format, put it in 'older'
				grouped.older.push(entry);
				return;
			}

			const date = entryDate(entry); // month is 0-indexed in JS Date
			const time = date.getTime();

			if (time > today.getTime()) {
				grouped.upcoming.push(entry);
			} else if (time === today.getTime()) {
				grouped.today.push(entry);
			} else if (time >= yesterday.getTime()) {
				grouped.yesterday.push(entry);
			} else if (time >= thisWeekStart.getTime()) {
				grouped.thisWeek.push(entry);
			} else if (time >= thisMonthStart.getTime()) {
				grouped.thisMonth.push(entry);
			} else {
				grouped.older.push(entry);
			}
		});

		// Sort each group by date (newest first)
		Object.keys(grouped).forEach((key) => {
			grouped[key as keyof typeof grouped].sort(
				(a, b) => entryDate(b).getTime() - entryDate(a).getTime()
			);
		});

		return grouped;
	}

	const groupedEntries = $derived(groupEntries(entries));
</script>

{#each Object.entries(groupedEntries) as [groupName, groupEntries] (groupName)}
	{#if groupEntries.length > 0}
		<div class="w-full text-xs space-y-1">
			<!-- Title -->
			<Label class="text-muted-foreground text-xs pl-1">
				{groupName === 'thisWeek'
					? 'This Week'
					: groupName === 'thisMonth'
						? 'This Month'
						: groupName.charAt(0).toUpperCase() + groupName.slice(1)}
			</Label>

			<!-- Notes -->
			{#each groupEntries as entry (entry.path)}
				<ContextMenu.Root>
					<ContextMenu.Trigger class="w-full" data-path={entry.path}>
						<div class="w-full h-full" role="button" tabindex="0">
							<Button
								size="sm"
								variant="ghost"
								scale="sm"
								class={cn(
									'h-7 w-full transition-all text-secondary-foreground/80 hover:text-foreground flex items-center gap-2 justify-start',
									appState.activeFile === entry.path && 'bg-accent text-foreground'
								)}
								onclick={() => openNote(entry.path, true)}
							>
								<Shortcut
									options={SHORTCUTS['note:delete']}
									callback={() => deleteNote(entry.path)}
								/>
								<Shortcut
									options={SHORTCUTS['note:show-in-folder']}
									callback={() => showInFolder(entry.path)}
								/>
								<span class="text-xs truncate">{entry.name}</span>
							</Button>
						</div>
					</ContextMenu.Trigger>
					<ContextMenu.Content class="w-44">
						<ContextMenu.Item class="flex items-center gap-2 font-base group">
							<Icon
								name="editPencil"
								class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground"
							/>
							Rename
							<ContextMenu.Shortcut
								>{shortcutToString(SHORTCUTS['note:rename'])}</ContextMenu.Shortcut
							>
						</ContextMenu.Item>
						<ContextMenu.Separator />
						<ContextMenu.Item
							class="flex items-center gap-2 font-base group"
							onclick={() => showInFolder(entry.path)}
						>
							<Icon name="eye" class="w-3.5 h-3.5 fill-foreground/70 group-hover:fill-foreground" />
							Show in {fileManagerLabel()}
							<ContextMenu.Shortcut
								>{shortcutToString(SHORTCUTS['note:show-in-folder'])}</ContextMenu.Shortcut
							>
						</ContextMenu.Item>
						<ContextMenu.Separator />
						<ContextMenu.Item
							class="flex text-destructive data-[highlighted]:bg-destructive/20 data-[highlighted]:text-destructive items-center gap-2 font-base group"
							onclick={() => deleteNote(entry.path)}
						>
							<Icon
								name="bin"
								class="w-3.5 h-3.5 fill-destructive/70 group-hover:fill-destructive"
							/>
							Delete
							<ContextMenu.Shortcut class="text-destructive/60"
								>{shortcutToString(SHORTCUTS['note:delete'])}</ContextMenu.Shortcut
							>
						</ContextMenu.Item>
					</ContextMenu.Content>
				</ContextMenu.Root>
			{/each}
		</div>
	{/if}
{/each}
