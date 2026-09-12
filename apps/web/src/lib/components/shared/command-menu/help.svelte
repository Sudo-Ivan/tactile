<script lang="ts">
	import Icon from '$lib/components/shared/icon.svelte';
	import { GITHUB_ISSUES_URL, GITHUB_SPONSOR_URL } from '@/constants';
	import * as Command from '@tactile/ui/components/command';
	import { commandItemClass } from './helpers';

	interface Props {
		onPageChange: (page: string | undefined) => void;
	}

	let { onPageChange }: Props = $props();
</script>

<Command.Group heading="Help & Support">
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a href={GITHUB_SPONSOR_URL} target="_blank" rel="noopener noreferrer">
		<Command.Item
			class={commandItemClass}
			value="sponsor"
			onSelect={() => {
				onPageChange(undefined);
			}}
		>
			<Icon name="heart" />
			Sponsor Tactile
		</Command.Item>
	</a>
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a href={GITHUB_ISSUES_URL} target="_blank" rel="noopener noreferrer">
		<Command.Item
			class={commandItemClass}
			value="help"
			onSelect={() => {
				onPageChange(undefined);
			}}
		>
			<Icon name="lifebouy" />
			Get help
		</Command.Item>
	</a>
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a href={GITHUB_ISSUES_URL} target="_blank" rel="noopener noreferrer">
		<Command.Item
			class={commandItemClass}
			value="feedback"
			onSelect={() => {
				onPageChange(undefined);
			}}
		>
			<Icon name="commentSquareText" />
			Leave feedback
		</Command.Item>
	</a>
</Command.Group>
