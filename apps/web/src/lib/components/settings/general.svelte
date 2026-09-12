<script lang="ts">
	import { setSettings } from '@/api/settings';
	import { BASE_COLLECTION_SETTINGS } from '@/constants';
	import { appState } from '@/store.svelte';
	import { Button } from '@tactile/ui/components/button';
	import Label from '@tactile/ui/components/label/label.svelte';
	import * as Select from '@tactile/ui/components/select';
	import Switch from '@tactile/ui/components/switch/switch.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import Icon from '../shared/icon.svelte';
	import Tooltip from '../shared/tooltip.svelte';
</script>

<div class="space-y-5">
	<div class="space-y-1">
		<Label class="text-sm">Auto save</Label>
		<p class="text-muted-foreground text-xs">Automatically save your notes.</p>
		<div class="flex flex-col items-start gap-3 pt-2">
			<Switch
				checked={appState.collectionSettings.editor.auto_save}
				onCheckedChange={(value) => {
					setSettings('collection', {
						...appState.collectionSettings,
						editor: { ...appState.collectionSettings.editor, auto_save: value }
					});
				}}
			/>

			<Label
				class={cn(
					'text-destructive text-xs font-normal',
					appState.collectionSettings.editor.auto_save && 'hidden'
				)}
			>
				Note: Disabling auto save may result in data loss and is strongly discouraged.
			</Label>
		</div>
	</div>

	<div class="space-y-1">
		<Label class="text-sm">Auto save debounce</Label>
		<p class="text-muted-foreground text-xs">The delay before auto save is triggered.</p>
		<div class="flex items-center gap-1 pt-2">
			<Select.Root
				type="single"
				value={String(appState.collectionSettings.editor.auto_save_debounce)}
				onValueChange={(value) => {
					if (!value) return;
					setSettings('collection', {
						...appState.collectionSettings,
						editor: { ...appState.collectionSettings.editor, auto_save_debounce: Number(value) }
					});
				}}
				disabled={!appState.collectionSettings.editor.auto_save}
			>
				<Select.Trigger>
					<Select.Value class="text-xs text-foreground/85"
						>{appState.collectionSettings.editor.auto_save_debounce}ms</Select.Value
					>
				</Select.Trigger>
				<Select.Content align="start" class="!w-28">
					<Select.Item value="250" label="250ms">250ms</Select.Item>
					<Select.Item value="500" label="500ms">500ms</Select.Item>
					<Select.Item value="750" label="750ms">750ms</Select.Item>
					<Select.Item value="1000" label="1000ms">1000ms</Select.Item>
					<Select.Item value="1500" label="1500ms">1500ms</Select.Item>
					<Select.Item value="2000" label="2000ms">2000ms</Select.Item>
					<Select.Item value="3000" label="3000ms">3000ms</Select.Item>
				</Select.Content>
			</Select.Root>

			{#if appState.collectionSettings.editor.auto_save_debounce !== BASE_COLLECTION_SETTINGS.editor.auto_save_debounce}
				<Tooltip text="Reset to default" side="bottom">
					<Button
						variant="ghost"
						size="icon"
						class="h-7 w-7 fill-muted-foreground hover:fill-foreground"
						scale="md"
						disabled={!appState.collectionSettings.editor.auto_save}
						onclick={() => {
							setSettings('collection', {
								...appState.collectionSettings,
								editor: {
									...appState.collectionSettings.editor,
									auto_save_debounce: BASE_COLLECTION_SETTINGS.editor.auto_save_debounce
								}
							});
						}}
					>
						<Icon name="undoCircle" class="h-3.5 w-3.5" />
					</Button>
				</Tooltip>
			{/if}
		</div>
	</div>

	<div class="space-y-1">
		<Label class="text-sm">Hidden files</Label>
		<p class="text-muted-foreground text-xs">Exclude files or extensions from the notes view.</p>
		<div class="flex items-center gap-2 pt-2">
			<Button
				variant="default"
				size="sm"
				class="h-7 text-primary-foreground/85 hover:text-primary-foreground text-sm font-normal"
				scale="sm"
				disabled
			>
				Add
			</Button>
		</div>
	</div>
</div>
