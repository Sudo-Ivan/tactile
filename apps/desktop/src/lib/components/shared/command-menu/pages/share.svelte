<script lang="ts">
	import Icon from '$lib/components/shared/icon.svelte';
	import { GITHUB_REPO_URL } from '@/constants';
	import * as Command from '@tactile/ui/components/command';
	import { open as browserOpen } from '@tauri-apps/plugin-shell';
	import { Share2 } from 'lucide-svelte';

	let { onPageChange }: { onPageChange: (page: string | undefined) => void } = $props();
</script>

<Command.Group heading="Share">
	<Command.Item
		class="text-foreground/90 gap-3 [&>*]:text-foreground/90 [&>*]:aria-selected:text-foreground [&>*]:fill-foreground/50 [&>*]:aria-selected:fill-foreground"
		value="copy_link"
		onSelect={() => {
			navigator.clipboard.writeText(GITHUB_REPO_URL);
			onPageChange(undefined);
		}}
	>
		<Icon name="browserUrl" />
		Copy link
	</Command.Item>
	<Command.Item
		class="text-foreground/90 gap-3 [&>*]:text-foreground/90 [&>*]:aria-selected:stroke-foreground [&>*]:stroke-foreground/50 [&>*]:stroke-[2px]"
		value="share_on_twitter"
		onSelect={() => {
			browserOpen(GITHUB_REPO_URL);
			onPageChange(undefined);
		}}
	>
		<Share2 />
		Share on X
	</Command.Item>
</Command.Group>
