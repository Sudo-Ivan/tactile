<script lang="ts">
	import Icon from '$lib/components/shared/icon.svelte';
	import { shortcutToString } from '@/utils';
	import * as Command from '@tactile/ui/components/command';
	import type { CommandGroup } from './commands';

	interface Props {
		groups: CommandGroup[];
		onPageChange: (page: string | undefined) => void;
	}

	let { groups, onPageChange }: Props = $props();
</script>

{#each groups as group (group.name)}
	<Command.Group heading={group.name}>
		{#each group.commands as command (command.title)}
			<Command.Item
				class="[&>*]:text-foreground/90 [&>*]:aria-selected:text-foreground [&>*]:fill-foreground/50 [&>*]:aria-selected:fill-foreground"
				value={command.title}
				onSelect={() => {
					const page = command.onSelect?.();
					if (typeof page === 'undefined') {
						onPageChange(undefined);
					} else {
						onPageChange(page);
					}
				}}
			>
				<div class="flex w-full items-center justify-between">
					<div class="flex items-center gap-1.5">
						{#if command.icon}
							<Icon name={command.icon} />
						{/if}
						<span class="text-foreground/80 group:hover:text-foreground/100"></span>
						{command.title}
					</div>
					{#if command.shortcut}
						<span class="ml-auto text-xs tracking-widest text-muted-foreground h-full"
							>{shortcutToString(command.shortcut)}
						</span>
					{/if}
				</div>
			</Command.Item>
		{/each}
	</Command.Group>
{/each}
