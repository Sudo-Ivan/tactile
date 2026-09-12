<script lang="ts">
	import Icon, { type IconKey } from '../shared/icon.svelte';
	import { SHORTCUTS } from '../../constants';
	import { isMobile } from '../../platform';
	import { appState } from '../../state/app.svelte';
	import { Button } from '@tactile/ui/components/button';
	import * as Dialog from '@tactile/ui/components/dialog';
	import { Label } from '@tactile/ui/components/label';
	import { Separator } from '@tactile/ui/components/separator';
	import * as Tabs from '@tactile/ui/components/tabs';
	import { cn } from '@tactile/ui/lib/utils';
	import type { Component } from 'svelte';
	import Shortcut from '../shared/shortcut.svelte';
	import Appearance from './appearance.svelte';
	import Editor from './editor.svelte';
	import General from './general.svelte';
	import TactileSync from './tactile-sync.svelte';

	const settings: Record<string, { name: string; icon: IconKey; content: Component }[]> = {
		App: [
			{
				name: 'General',
				icon: 'settingsSolid',
				content: General
			},
			{
				name: 'Appearance',
				icon: 'opactiySolid',
				content: Appearance
			},
			{
				name: 'Editor',
				icon: 'editPencilSolid',
				content: Editor
			}
		],
		Syncronization: [
			{
				name: 'Tactile Sync',
				icon: 'cloudSolid',
				content: TactileSync
			}
		]
	};
</script>

<Dialog.Root
	open={appState.settingsStore.isOpen}
	onOpenChange={(value) => {
		appState.settingsStore = { isOpen: value, activePage: 'general' };
	}}
>
	<Dialog.Trigger>
		<Button
			size="icon"
			variant="ghost"
			class="h-7 w-7 fill-muted-foreground hover:fill-foreground"
			scale="md"
		>
			<Shortcut options={SHORTCUTS['app:settings']} />
			<Icon name="settings" class="w-[18px] h-[18px]" />
		</Button>
	</Dialog.Trigger>
	<Dialog.Content
		class={cn(
			'flex items-center justify-center pt-16',
			isMobile()
				? '!w-full !h-full !top-0 !right-0 !bottom-0 !left-0 !rounded-none'
				: '!w-[90%] !h-[90%] !top-[5%] !right-[5%] !bottom-[5%] !left-[5%]'
		)}
	>
		<Tabs.Root
			value={appState.settingsStore.activePage}
			onValueChange={(value) => {
				appState.settingsStore.activePage = value ?? 'general';
			}}
			class={cn('flex items-center justify-center h-full w-full', isMobile() ? 'gap-4' : 'gap-10')}
		>
			<!-- Categories as label, rest as tabtrigger & corresponding content -->
			<div class="flex flex-col items-center gap-4 h-full justify-start min-w-[160px]">
				{#each Object.keys(settings) as setting (setting)}
					<div class="flex flex-col items-start gap-2 w-full">
						<Label class="text-foreground/70 text-xs pl-2">
							{setting}
						</Label>
						<Tabs.List
							class="flex items-center justify-start flex-col w-full h-fit bg-transparent p-0 gap-1.5"
						>
							{#each settings[setting] as tab (tab.name)}
								<Tabs.Trigger
									value={tab.name.toLocaleLowerCase()}
									class="w-full h-7 rounded-lg px-3 hover:bg-accent hover:text-accent-foreground transition-transform active:scale-[98%] data-[state=active]:bg-accent text-foreground data-[state=active]:fill-foreground fill-muted-foreground/80 text-foreground/70 hover:fill-foreground items-center justify-start gap-2 text-sm font-normal"
								>
									<Icon name={tab.icon} class="w-4 h-4" />
									{tab.name}
								</Tabs.Trigger>
							{/each}
						</Tabs.List>
					</div>
					{#if setting !== Object.keys(settings)[Object.keys(settings).length - 1]}
						<Separator />
					{/if}
				{/each}
			</div>
			<div
				class={cn(
					'flex flex-col items-center justify-center gap-2 h-full',
					isMobile() ? 'flex-1 min-w-0' : 'w-2/4'
				)}
			>
				{#each Object.keys(settings) as setting (setting)}
					{#each settings[setting] as tab (tab.name)}
						<Tabs.Content
							value={tab.name.toLocaleLowerCase()}
							class="w-full h-full -mt-2.5 overflow-y-auto pb-10"
						>
							<div class="flex flex-col items-start justify-start h-full w-full gap-3 px-1">
								<h1 class="text-lg font-medium">{tab.name}</h1>
								<tab.content />
							</div>
						</Tabs.Content>
					{/each}
				{/each}
			</div>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
