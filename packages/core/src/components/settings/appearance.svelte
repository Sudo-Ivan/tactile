<script lang="ts">
	import { setSettings } from '../../api/settings';
	import { setThemeMode, themeMode } from '../../platform';
	import { appState } from '../../state/app.svelte';
	import { Button } from '@tactile/ui/components/button';
	import Label from '@tactile/ui/components/label/label.svelte';
	import * as Select from '@tactile/ui/components/select';
	import { cn } from '@tactile/ui/lib/utils';
	import Icon from '../shared/icon.svelte';
	import Tooltip from '../shared/tooltip.svelte';

	// Select values are the stored CSS font-family stacks; uninstalled fonts
	// fall back to the next family in the stack.
	const fontOptions = [
		{ value: 'system-ui, sans-serif', label: 'System UI' },
		{ value: "'Inter', system-ui, sans-serif", label: 'Inter' },
		{ value: "'Roboto', system-ui, sans-serif", label: 'Roboto' },
		{ value: "'Open Sans', system-ui, sans-serif", label: 'Open Sans' },
		{ value: "Georgia, 'Times New Roman', serif", label: 'Serif' },
		{ value: "ui-monospace, 'SF Mono', Menlo, monospace", label: 'Monospace' }
	];

	const selectedFont = $derived(
		fontOptions.some((option) => option.value === appState.appSettings.interface_font)
			? appState.appSettings.interface_font
			: fontOptions[0].value
	);
</script>

<div class="space-y-5">
	<div class="space-y-1">
		<Label class="text-sm">Color scheme</Label>
		<p class="text-muted-foreground text-xs">Change the color scheme of the app.</p>
		<div class="flex items-center gap-2 pt-2">
			<Tooltip text="System" side="bottom">
				<Button
					size="icon"
					variant="ghost"
					class={cn(
						'h-7 w-7 fill-muted-foreground hover:fill-foreground',
						themeMode() === 'system' && 'bg-accent fill-foreground'
					)}
					scale="md"
					onclick={() => setThemeMode('system')}
					aria-label="System color scheme"
				>
					<Icon name="monitor" class="w-4 h-4" />
				</Button>
			</Tooltip>
			<Tooltip text="Light" side="bottom">
				<Button
					size="icon"
					variant="ghost"
					class={cn(
						'h-7 w-7 fill-muted-foreground hover:fill-foreground',
						themeMode() === 'light' && 'bg-accent fill-foreground'
					)}
					scale="md"
					onclick={() => setThemeMode('light')}
					aria-label="Light color scheme"
				>
					<Icon name="sun" class="w-4 h-4" />
				</Button>
			</Tooltip>
			<Tooltip text="Dark" side="bottom">
				<Button
					size="icon"
					variant="ghost"
					class={cn(
						'h-7 w-7 fill-muted-foreground hover:fill-foreground',
						themeMode() === 'dark' && 'bg-accent fill-foreground'
					)}
					scale="md"
					onclick={() => setThemeMode('dark')}
					aria-label="Dark color scheme"
				>
					<Icon name="moon" class="w-4 h-4" />
				</Button>
			</Tooltip>
		</div>
	</div>

	<div class="space-y-1">
		<Label class="text-sm">Fonts</Label>
		<p class="text-muted-foreground text-xs">Change the interface font.</p>
		<div class="flex items-center gap-2 pt-2">
			<Select.Root
				type="single"
				value={selectedFont}
				onValueChange={(value) =>
					setSettings('app', { ...appState.appSettings, interface_font: value })}
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
</div>
