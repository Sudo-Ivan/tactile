<script lang="ts">
	import { setSettings } from '../../api/settings';
	import { AUTO_SAVE_DEBOUNCE_OPTIONS, BASE_COLLECTION_SETTINGS } from '../../constants';
	import { platformHooks } from '../../platform';
	import { appState } from '../../state/app.svelte';
	import { Button } from '@tactile/ui/components/button';
	import Label from '@tactile/ui/components/label/label.svelte';
	import * as Select from '@tactile/ui/components/select';
	import Switch from '@tactile/ui/components/switch/switch.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import Icon from '../shared/icon.svelte';
	import Tooltip from '../shared/tooltip.svelte';

	const settings = $derived(appState.collectionSettings);

	const handleValueChange = (value: string) => {
		if (!value) return;

		setSettings('collection', {
			...settings,
			notes: {
				...settings.notes,
				trash_dir: value as 'system' | 'tactile' | 'delete'
			}
		});
	};
</script>

<div class="space-y-5">
	<div class="space-y-1">
		<Label class="text-sm">Auto save</Label>
		<p class="text-muted-foreground text-xs">Automatically save your notes.</p>
		<div class="flex flex-col items-start gap-3 pt-2">
			<Switch
				checked={settings.editor.auto_save}
				onCheckedChange={(value) => {
					setSettings('collection', {
						...settings,
						editor: { ...settings.editor, auto_save: value }
					});
				}}
			/>

			<Label
				class={cn('text-destructive text-xs font-normal', settings.editor.auto_save && 'hidden')}
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
				value={settings.editor.auto_save_debounce.toString()}
				onValueChange={(value) => {
					if (!value) return;
					setSettings('collection', {
						...settings,
						editor: { ...settings.editor, auto_save_debounce: Number(value) }
					});
				}}
				disabled={!settings.editor.auto_save}
			>
				<Select.Trigger>
					<Select.Value class="text-xs text-foreground/85" />
				</Select.Trigger>
				<Select.Content align="start" class="!w-28">
					{#each AUTO_SAVE_DEBOUNCE_OPTIONS as ms (ms)}
						<Select.Item value={String(ms)} label="{ms}ms">{ms}ms</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>

			{#if settings.editor.auto_save_debounce !== BASE_COLLECTION_SETTINGS.editor.auto_save_debounce}
				<Tooltip text="Reset to default" side="bottom">
					<Button
						variant="ghost"
						size="icon"
						class="h-7 w-7 fill-muted-foreground hover:fill-foreground"
						scale="md"
						disabled={!settings.editor.auto_save}
						onclick={() => {
							setSettings('collection', {
								...settings,
								editor: {
									...settings.editor,
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

	<!-- 'system' requires an OS trash, which only exists where the platform
	     hook provides one (desktop). Hidden entirely on web, matching its
	     previous UI. -->
	{#if platformHooks()?.moveToSystemTrash}
		<div class="space-y-1">
			<Label class="text-sm">Deleted files location</Label>
			<p class="text-muted-foreground text-xs">Where to move deleted files to.</p>
			<div class="flex items-center gap-2 pt-2">
				<Select.Root
					type="single"
					value={settings.notes.trash_dir}
					onValueChange={handleValueChange}
				>
					<Select.Trigger>
						<Select.Value class="text-xs text-foreground/85" />
					</Select.Trigger>
					<Select.Content align="start" class="!w-40">
						<Select.Item value="system" label="System trash">System trash</Select.Item>
						<Select.Item value="tactile" label="Tactile trash">Tactile trash</Select.Item>
						<Select.Item value="delete" label="Permanently delete">Permanently delete</Select.Item>
					</Select.Content>
				</Select.Root>
			</div>
		</div>
	{/if}

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
