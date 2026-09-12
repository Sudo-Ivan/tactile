<script lang="ts">
	import { setSettings } from '@/api/settings';
	import { appState } from '@/store.svelte';
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
					<Select.Item value="250" label="250ms">250ms</Select.Item>
					<Select.Item value="500" label="500ms">500ms</Select.Item>
					<Select.Item value="750" label="750ms">750ms</Select.Item>
					<Select.Item value="1000" label="1000ms">1000ms</Select.Item>
					<Select.Item value="1500" label="1500ms">1500ms</Select.Item>
					<Select.Item value="2000" label="2000ms">2000ms</Select.Item>
					<Select.Item value="3000" label="3000ms">3000ms</Select.Item>
				</Select.Content>
			</Select.Root>

			{#if settings.editor.auto_save_debounce != 750}
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
								editor: { ...settings.editor, auto_save_debounce: 750 }
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
		<Label class="text-sm">Deleted files location</Label>
		<p class="text-muted-foreground text-xs">Where to move deleted files to.</p>
		<div class="flex items-center gap-2 pt-2">
			<Select.Root type="single" value={settings.notes.trash_dir} onValueChange={handleValueChange}>
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
