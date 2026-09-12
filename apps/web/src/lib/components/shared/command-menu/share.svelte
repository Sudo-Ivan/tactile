<script lang="ts">
	import Icon from '$lib/components/shared/icon.svelte';
	import { GITHUB_URL } from '@/constants';
	import * as Command from '@tactile/ui/components/command';
	import { Share2 } from 'lucide-svelte';
	import { commandItemClass } from './helpers';

	interface Props {
		onPageChange: (page: string | undefined) => void;
	}

	let { onPageChange }: Props = $props();
</script>

<Command.Group heading="Share">
	<Command.Item
		class={commandItemClass}
		value="copy_link"
		onSelect={() => {
			navigator.clipboard.writeText(GITHUB_URL);
			onPageChange(undefined);
		}}
	>
		<Icon name="browserUrl" />
		Copy link
	</Command.Item>
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
		<Command.Item
			class="text-foreground/90 gap-3 [&>*]:text-foreground/90 [&>*]:aria-selected:text-foreground [&>*]:aria-selected:stroke-foreground [&>*]:stroke-foreground/50 [&>*]:stroke-[2px]"
			value="share_on_twitter"
			onSelect={() => {
				onPageChange(undefined);
			}}
		>
			<Share2 />
			Share on X
		</Command.Item>
	</a>
</Command.Group>
