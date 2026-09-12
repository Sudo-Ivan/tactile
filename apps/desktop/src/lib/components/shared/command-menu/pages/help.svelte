<script lang="ts">
	import Icon from '$lib/components/shared/icon.svelte';
	import { GITHUB_ISSUES_URL, GITHUB_SPONSOR_URL } from '@/constants';
	import * as Command from '@tactile/ui/components/command';
	import { open as browserOpen } from '@tauri-apps/plugin-shell';

	let { onPageChange }: { onPageChange: (page: string | undefined) => void } = $props();

	const itemClass =
		'text-foreground/90 gap-3 [&>*]:text-foreground/90 [&>*]:aria-selected:text-foreground [&>*]:fill-foreground/50 [&>*]:aria-selected:fill-foreground';
</script>

<Command.Group heading="Help & Support">
	<Command.Item
		class={itemClass}
		value="sponsor"
		onSelect={() => {
			browserOpen(GITHUB_SPONSOR_URL);
			onPageChange(undefined);
		}}
	>
		<Icon name="heart" />
		Sponsor Tactile
	</Command.Item>
	<Command.Item
		class={itemClass}
		value="help"
		onSelect={() => {
			browserOpen(GITHUB_ISSUES_URL);
			onPageChange(undefined);
		}}
	>
		<Icon name="lifebouy" />
		Get help
	</Command.Item>

	<Command.Item
		class={itemClass}
		value="feedback"
		onSelect={() => {
			browserOpen(GITHUB_ISSUES_URL);
			onPageChange(undefined);
		}}
	>
		<Icon name="commentSquareText" />
		Leave feedback
	</Command.Item>
</Command.Group>
