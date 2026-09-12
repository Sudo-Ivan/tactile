<script lang="ts">
	import Icon from '../../icon.svelte';
	import { commandItemClass } from '../../../../commands';
	import { GITHUB_REPO_URL } from '../../../../constants';
	import { openExternal } from '../../../../platform';
	import * as Command from '@tactile/ui/components/command';
	import { Share2 } from 'lucide-svelte';

	let { onPageChange }: { onPageChange: (page: string | undefined) => void } = $props();
</script>

<Command.Group heading="Share">
	<Command.Item
		class={commandItemClass}
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
			openExternal(GITHUB_REPO_URL);
			onPageChange(undefined);
		}}
	>
		<Share2 />
		Share on X
	</Command.Item>
</Command.Group>
