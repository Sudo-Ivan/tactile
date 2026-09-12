<script lang="ts">
	import Icon from '../../icon.svelte';
	import { commandItemClass } from '../../../../commands';
	import { GITHUB_ISSUES_URL, GITHUB_SPONSOR_URL } from '../../../../constants';
	import { openExternal } from '../../../../platform';
	import * as Command from '@tactile/ui/components/command';

	let { onPageChange }: { onPageChange: (page: string | undefined) => void } = $props();
</script>

<Command.Group heading="Help & Support">
	<Command.Item
		class={commandItemClass}
		value="sponsor"
		onSelect={() => {
			openExternal(GITHUB_SPONSOR_URL);
			onPageChange(undefined);
		}}
	>
		<Icon name="heart" />
		Sponsor Tactile
	</Command.Item>
	<Command.Item
		class={commandItemClass}
		value="help"
		onSelect={() => {
			openExternal(GITHUB_ISSUES_URL);
			onPageChange(undefined);
		}}
	>
		<Icon name="lifebouy" />
		Get help
	</Command.Item>

	<Command.Item
		class={commandItemClass}
		value="feedback"
		onSelect={() => {
			openExternal(GITHUB_ISSUES_URL);
			onPageChange(undefined);
		}}
	>
		<Icon name="commentSquareText" />
		Leave feedback
	</Command.Item>
</Command.Group>
