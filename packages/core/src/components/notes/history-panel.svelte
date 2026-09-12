<script lang="ts">
	import {
		listNoteVersions,
		readNoteContent,
		readNoteVersion,
		restoreNoteVersion
	} from '../../api/notes';
	import Icon from '../shared/icon.svelte';
	import Tooltip from '../shared/tooltip.svelte';
	import { isMobile } from '../../platform';
	import { appState } from '../../state/app.svelte';
	import { collapseUnchanged, diffLines, type DisplayRow, type DiffResult } from '../../utils/diff';
	import { formatFileSize, formatTimeAgo } from '../../utils/format';
	import { Button } from '@tactile/ui/components/button';
	import Label from '@tactile/ui/components/label/label.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import type { FileVersion } from '@tactile/storage';
	import markdownit from 'markdown-it';
	import { untrack } from 'svelte';

	let versions = $state<FileVersion[]>([]);
	let loading = $state(false);
	let error = $state('');

	// Selected version state
	let selected = $state<FileVersion | null>(null);
	let selectedContent = $state('');
	let currentContent = $state('');
	let view = $state<'diff' | 'preview'>('diff');
	let confirming = $state(false);
	let restoring = $state(false);

	let diff = $derived<DiffResult | null>(
		selected ? diffLines(selectedContent, currentContent) : null
	);
	let rows = $derived<DisplayRow[]>(diff ? collapseUnchanged(diff.lines) : []);

	const md = markdownit({ html: true, linkify: true, typographer: true });

	async function refresh() {
		const path = appState.activeFile;
		if (!path) {
			versions = [];
			return;
		}
		loading = true;
		error = '';
		try {
			versions = await listNoteVersions(path);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load versions';
			versions = [];
		}
		loading = false;
	}

	async function select(version: FileVersion) {
		const path = appState.activeFile;
		if (!path) return;
		error = '';
		confirming = false;
		try {
			const [versionContent, current] = await Promise.all([
				readNoteVersion(path, version.id),
				readNoteContent(path)
			]);
			selected = version;
			selectedContent = versionContent;
			currentContent = current;
			view = 'diff';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load version';
		}
	}

	function back() {
		selected = null;
		selectedContent = '';
		confirming = false;
	}

	async function restore() {
		if (!selected || !appState.activeFile) return;
		restoring = true;
		try {
			await restoreNoteVersion(appState.activeFile, selected.id);
			back();
			await refresh();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to restore version';
		}
		restoring = false;
	}

	// Reload when the active note changes.
	$effect(() => {
		const path = appState.activeFile;
		untrack(() => {
			back();
			if (path) refresh();
		});
	});

	// Refresh after saves so new snapshots show up while the panel is open.
	$effect(() => {
		return appState.editor.subscribeToSaveEvents(() => {
			if (!selected) refresh();
		});
	});
</script>

{#if selected}
	<!-- Version detail -->
	<div class="flex flex-col w-full h-full">
		<div class="flex items-center gap-1.5 px-3 py-2 border-b shrink-0">
			<Tooltip text="Back to versions" side="bottom">
				<Button
					size="icon"
					variant="ghost"
					scale="md"
					class="h-6 w-6 fill-muted-foreground hover:fill-foreground transition-all"
					onclick={back}
				>
					<Icon name="arrowLeft" class="w-4 h-4" />
				</Button>
			</Tooltip>
			<div class="flex flex-col min-w-0 flex-1">
				<Tooltip text={new Date(selected.timestamp).toLocaleString()} side="bottom">
					<span class="text-[13px] text-secondary-foreground truncate cursor-default">
						{formatTimeAgo(new Date(selected.timestamp))}
					</span>
				</Tooltip>
				<span class="text-[11px] text-muted-foreground">
					{formatFileSize(selected.size)}
					{#if diff}
						· <span class="text-green-500/90">+{diff.added}</span>
						<span class="text-red-500/90">-{diff.removed}</span> lines vs current
					{/if}
				</span>
			</div>
		</div>

		<!-- View toggle -->
		<div class="flex items-center gap-1 px-3 py-1.5 shrink-0">
			<Button
				size="sm"
				variant="ghost"
				scale="sm"
				class={cn(
					'h-6 px-2 text-xs text-muted-foreground hover:text-foreground',
					view === 'diff' && 'text-foreground bg-accent'
				)}
				onclick={() => (view = 'diff')}
			>
				Changes
			</Button>
			<Button
				size="sm"
				variant="ghost"
				scale="sm"
				class={cn(
					'h-6 px-2 text-xs text-muted-foreground hover:text-foreground',
					view === 'preview' && 'text-foreground bg-accent'
				)}
				onclick={() => (view = 'preview')}
			>
				Preview
			</Button>
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-auto px-3 pb-2 min-h-0">
			{#if view === 'preview'}
				{@const rendered = md.render(selectedContent)}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				<div class="prose prose-theme text-[13px] break-words">{@html rendered}</div>
			{:else if diff}
				{#if diff.added === 0 && diff.removed === 0}
					<p class="text-[13px] text-muted-foreground py-2">Identical to the current version</p>
				{:else}
					<div
						class="font-mono text-[11px] leading-5 rounded-md border bg-secondary-background overflow-hidden"
					>
						{#each rows as row, i (i)}
							{#if row.type === 'collapsed'}
								<div
									class="px-2 py-0.5 text-muted-foreground/70 bg-muted/40 text-center select-none"
								>
									{row.count} unchanged {row.count === 1 ? 'line' : 'lines'}
								</div>
							{:else}
								<div
									class={cn(
										'flex gap-2 px-1.5 whitespace-pre-wrap break-all',
										row.type === 'add' && 'bg-green-500/10 text-green-600 dark:text-green-400',
										row.type === 'del' && 'bg-red-500/10 text-red-600 dark:text-red-400',
										row.type === 'same' && 'text-muted-foreground'
									)}
								>
									<span class="w-4 shrink-0 text-right select-none opacity-60">
										{row.type === 'add' ? (row.newNumber ?? '') : (row.oldNumber ?? '')}
									</span>
									<span class="select-none w-3 shrink-0">
										{row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '}
									</span>
									<span class="min-w-0">{row.text || ' '}</span>
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			{/if}
		</div>

		<!-- Actions -->
		<div class="flex flex-col gap-2 px-3 py-2.5 border-t shrink-0">
			{#if confirming}
				<p class="text-[11px] text-muted-foreground leading-snug">
					Restore this version? Your current content is kept as a new version, so this is undoable.
				</p>
				<div class="flex gap-1.5">
					<Button
						size="sm"
						variant="default"
						scale="sm"
						class="h-7 flex-1 text-xs"
						disabled={restoring}
						onclick={restore}
					>
						{restoring ? 'Restoring...' : 'Confirm restore'}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						scale="sm"
						class="h-7 text-xs"
						onclick={() => (confirming = false)}
					>
						Cancel
					</Button>
				</div>
			{:else}
				<Button
					size="sm"
					variant="default"
					scale="sm"
					class="h-7 w-full text-xs"
					onclick={() => (confirming = true)}
				>
					Restore this version
				</Button>
			{/if}
		</div>
	</div>
{:else}
	<!-- Version list -->
	<div class="flex flex-col w-full h-full overflow-auto">
		{#if loading && versions.length === 0}
			<div class="flex flex-col items-center justify-center w-full h-full">
				<p class="text-[13px] text-muted-foreground">Loading history...</p>
			</div>
		{:else if error}
			<div class="flex flex-col items-center justify-center w-full h-full px-4">
				<p class="text-[13px] text-muted-foreground text-center">{error}</p>
			</div>
		{:else if versions.length === 0}
			<div class="flex flex-col items-center justify-center w-full h-full px-4 gap-1.5">
				<Icon name="reload" class="w-5 h-5 fill-muted-foreground/60" />
				<p class="text-[13px] text-muted-foreground text-center">No previous versions</p>
				<p class="text-[11px] text-muted-foreground/70 text-center leading-snug">
					A snapshot is saved each time you edit this note, so you can always go back.
				</p>
			</div>
		{:else}
			<div class="flex flex-col gap-0.5 px-2 py-2">
				<Label class="px-2 pb-1 text-[11px] text-muted-foreground"
					>{versions.length} {versions.length === 1 ? 'version' : 'versions'}</Label
				>
				{#each versions as version, i (version.id)}
					<button
						class={cn(
							'flex items-center justify-between gap-2 w-full px-2 py-1.5 rounded-md text-left hover:bg-accent transition-colors group',
							isMobile() && 'min-h-11'
						)}
						onclick={() => select(version)}
					>
						<div class="flex flex-col min-w-0">
							<Tooltip text={new Date(version.timestamp).toLocaleString()} side="right">
								<span class="text-[13px] text-secondary-foreground truncate">
									{formatTimeAgo(new Date(version.timestamp))}
								</span>
							</Tooltip>
							<span class="text-[11px] text-muted-foreground">{formatFileSize(version.size)}</span>
						</div>
						<div class="flex items-center gap-1.5 shrink-0">
							{#if i === 0}
								<span class="text-[10px] text-muted-foreground bg-accent rounded px-1 py-0.5"
									>latest</span
								>
							{/if}
							<Icon
								name="chevron"
								class="w-3.5 h-3.5 -rotate-90 fill-muted-foreground/50 group-hover:fill-foreground transition-all"
							/>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}
