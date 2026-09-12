<script lang="ts">
	import Tooltip from '../shared/tooltip.svelte';
	import type { NoteMetadataParams } from '../../types';
	import { formatFileSize, formatTimeAgo } from '../../utils/format';
	import Label from '@tactile/ui/components/label/label.svelte';

	let { metadata }: { metadata: NoteMetadataParams } = $props();

	let createdTimeAgo = $state('');
	let modifiedTimeAgo = $state('');

	// Handle reactivity for time ago values
	function updateTimes() {
		createdTimeAgo = formatTimeAgo(metadata.fileMetadata.createdAt);
		modifiedTimeAgo = formatTimeAgo(metadata.fileMetadata.modifiedAt);
	}

	$effect(() => {
		updateTimes();
		const interval = setInterval(updateTimes, 1000);
		return () => clearInterval(interval);
	});
</script>

<div class="flex flex-col gap-1.5 items-start w-full px-4 py-2.5 h-full overflow-auto">
	<!-- Created -->
	<div class="flex flex-row items-center justify-between w-full h-6 cursor-default">
		<Label class="text-[13px] font-normal text-muted-foreground">Created</Label>
		<Tooltip text={new Date(metadata.fileMetadata.createdAt).toLocaleString()}>
			<span class="text-[13px] text-secondary-foreground">{createdTimeAgo}</span>
		</Tooltip>
	</div>

	<!-- Modified -->
	<div class="flex flex-row items-center justify-between w-full h-6 cursor-default">
		<Label class="text-[13px] font-normal text-muted-foreground">Modified</Label>
		<Tooltip text={new Date(metadata.fileMetadata.modifiedAt).toLocaleString()}>
			<span class="text-[13px] text-secondary-foreground">{modifiedTimeAgo}</span>
		</Tooltip>
	</div>

	<!-- File size -->
	<div class="flex flex-row items-center justify-between w-full h-6 cursor-default">
		<Label class="text-[13px] font-normal text-muted-foreground">File Size</Label>

		<span class="text-[13px] text-secondary-foreground"
			>{formatFileSize(metadata.fileMetadata.size)}</span
		>
	</div>

	<!-- Character count -->
	<div class="flex flex-row items-center justify-between w-full h-6 cursor-default">
		<Label class="text-[13px] font-normal text-muted-foreground">Characters</Label>
		<span class="text-[13px] text-secondary-foreground">{metadata.editorMetadata.characters}</span>
	</div>

	<!-- Word count -->
	<div class="flex flex-row items-center justify-between w-full h-6 cursor-default">
		<Label class="text-[13px] font-normal text-muted-foreground">Words</Label>
		<span class="text-[13px] text-secondary-foreground">{metadata.editorMetadata.words}</span>
	</div>

	<!-- Read time -->
	<div class="flex flex-row items-center justify-between w-full h-6 cursor-default">
		<Label class="text-[13px] font-normal text-muted-foreground">Read Time</Label>
		<Tooltip text="Estimated read time based on 200 words per minute">
			<span class="text-[13px] text-secondary-foreground"
				>{metadata.editorMetadata.avgReadingTime}</span
			>
		</Tooltip>
	</div>
</div>
