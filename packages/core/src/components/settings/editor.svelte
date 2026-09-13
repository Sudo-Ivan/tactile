<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { openNote } from '../../api/notes';
	import { setSettings } from '../../api/settings';
	import { appState } from '../../state/app.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import Label from '@tactile/ui/components/label/label.svelte';
	import * as Select from '@tactile/ui/components/select';
	import { Switch } from '@tactile/ui/components/switch';

	const settings = $derived(appState.collectionSettings);

	// Select values are the stored CSS font-family stacks; uninstalled fonts
	// fall back to the next family in the stack.
	const fontOptions = [
		{ value: 'system-ui, sans-serif', label: 'System UI' },
		{ value: "Georgia, 'Times New Roman', serif", label: 'Serif' },
		{ value: "ui-monospace, 'SF Mono', Menlo, monospace", label: 'Monospace' },
		{ value: "'Inter', system-ui, sans-serif", label: 'Inter' },
		{ value: "'Roboto', system-ui, sans-serif", label: 'Roboto' },
		{ value: "'Open Sans', system-ui, sans-serif", label: 'Open Sans' }
	];

	const fontSizeOptions = [
		{ value: '12', label: 'Smaller (12px)' },
		{ value: '13', label: 'Small (13px)' },
		{ value: '14', label: 'Normal (14px)' },
		{ value: '16', label: 'Large (16px)' },
		{ value: '18', label: 'Larger (18px)' }
	];

	// Stored values from before the select existed (for example bare
	// 'system-ui') fall back to the first option.
	const selectedFont = $derived(
		fontOptions.some((option) => option.value === settings.editor.font)
			? settings.editor.font
			: fontOptions[0].value
	);
</script>

<div class="space-y-5">
	<div class="space-y-1">
		<Label class="text-sm">Font</Label>
		<p class="text-muted-foreground text-xs">Change the editor font.</p>
		<div class="flex items-center gap-2 pt-2">
			<Select.Root
				type="single"
				value={selectedFont}
				onValueChange={(value) =>
					setSettings('collection', {
						...settings,
						editor: { ...settings.editor, font: value }
					})}
			>
				<Select.Trigger>
					<Select.Value class="text-sm text-foreground/85" />
				</Select.Trigger>
				<Select.Content>
					{#each fontOptions as option (option.value)}
						<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</div>

	<div class="space-y-1">
		<Label class="text-sm">Font size</Label>
		<p class="text-muted-foreground text-xs">Change the editor font size.</p>
		<div class="flex items-center gap-2 pt-2">
			<Select.Root
				type="single"
				value={String(settings.editor.size)}
				onValueChange={(value) =>
					setSettings('collection', {
						...settings,
						editor: { ...settings.editor, size: parseInt(value, 10) || 14 }
					})}
			>
				<Select.Trigger>
					<Select.Value class="text-sm text-foreground/85" />
				</Select.Trigger>
				<Select.Content>
					{#each fontSizeOptions as option (option.value)}
						<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</div>

	<div class="space-y-1">
		<Label class="text-sm">Text correction</Label>
		<p class="text-muted-foreground text-xs">Enable or disable various text correction features.</p>
		<div class="flex flex-col items-start gap-2.5 pt-2">
			<div class="flex items-center gap-2">
				<Switch
					checked={settings.editor.auto_correct}
					onCheckedChange={(value) =>
						setSettings('collection', {
							...settings,
							editor: { ...settings.editor, auto_correct: value }
						})}
				/>
				<Label
					class={cn(
						'text-sm font-normal transition-colors',
						settings.editor.auto_correct ? 'text-foreground/90' : 'text-foreground/60'
					)}
				>
					Auto Correct
				</Label>
			</div>
			<div class="flex items-center gap-2">
				<Switch
					checked={settings.editor.spell_check}
					onCheckedChange={(value) =>
						setSettings('collection', {
							...settings,
							editor: { ...settings.editor, spell_check: value }
						})}
				/>
				<Label
					class={cn(
						'text-sm font-normal transition-colors',
						settings.editor.spell_check ? 'text-foreground/90' : 'text-foreground/60'
					)}
				>
					Spell Check
				</Label>
			</div>
		</div>
	</div>

	<div class="space-y-1">
		<Label class="text-sm">Text width</Label>
		<p class="text-muted-foreground text-xs">
			How wide lines run before wrapping. Full width follows the window.
		</p>
		<div class="flex items-center gap-2 pt-2">
			<Select.Root
				type="single"
				value={settings.editor.line_length}
				onValueChange={(value) =>
					setSettings('collection', {
						...settings,
						editor: {
							...settings.editor,
							line_length: value as 'full' | 'wide' | 'readable'
						}
					})}
			>
				<Select.Trigger>
					<Select.Value class="text-sm text-foreground/85" />
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="full" label="Full width">Full width</Select.Item>
					<Select.Item value="wide" label="Wide (90ch)">Wide (90ch)</Select.Item>
					<Select.Item value="readable" label="Readable (65ch)">Readable (65ch)</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>
	</div>

	<div class="space-y-1">
		<Label class="text-sm">Additional settings</Label>
		<p class="text-muted-foreground text-xs">Additional settings for the editor.</p>
		<div class="flex flex-col items-start gap-2.5 pt-2">
			<div class="flex items-center gap-2">
				<Switch
					checked={settings.editor.show_inline_title}
					onCheckedChange={(value) => {
						setSettings('collection', {
							...settings,
							editor: { ...settings.editor, show_inline_title: value }
						});
						invalidateAll();
						openNote(appState.activeFile || '', true);
					}}
				/>
				<Label
					class={cn(
						'text-sm font-normal transition-colors',
						settings.editor.show_inline_title ? 'text-foreground/90' : 'text-foreground/60'
					)}
				>
					Show inline title
				</Label>
			</div>
			<div class="flex items-center gap-2">
				<Switch
					checked={settings.editor.show_line_numbers}
					onCheckedChange={(value) =>
						setSettings('collection', {
							...settings,
							editor: { ...settings.editor, show_line_numbers: value }
						})}
				/>
				<Label
					class={cn(
						'text-sm font-normal transition-colors',
						settings.editor.show_line_numbers ? 'text-foreground/90' : 'text-foreground/60'
					)}
				>
					Show line numbers in source mode
				</Label>
			</div>
			<div class="flex items-center gap-2">
				<Switch
					checked={settings.editor.word_wrap}
					onCheckedChange={(value) =>
						setSettings('collection', {
							...settings,
							editor: { ...settings.editor, word_wrap: value }
						})}
				/>
				<Label
					class={cn(
						'text-sm font-normal transition-colors',
						settings.editor.word_wrap ? 'text-foreground/90' : 'text-foreground/60'
					)}
				>
					Word wrap
				</Label>
			</div>
			<div class="flex items-center gap-2">
				<Switch
					checked={settings.editor.show_toolbar}
					onCheckedChange={(value) =>
						setSettings('collection', {
							...settings,
							editor: { ...settings.editor, show_toolbar: value }
						})}
				/>
				<Label
					class={cn(
						'text-sm font-normal transition-colors',
						settings.editor.show_toolbar ? 'text-foreground/90' : 'text-foreground/60'
					)}
				>
					Show editor toolbar
				</Label>
			</div>
		</div>
	</div>
</div>
