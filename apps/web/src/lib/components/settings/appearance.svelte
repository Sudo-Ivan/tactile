<script lang="ts">
	import { Button } from '@tactile/ui/components/button';
	import Label from '@tactile/ui/components/label/label.svelte';
	import * as Select from '@tactile/ui/components/select';
	import { cn } from '@tactile/ui/lib/utils';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import Icon from '../shared/icon.svelte';
	import Tooltip from '../shared/tooltip.svelte';

	const themes = [{ value: 'tactile', label: 'Tactile' }];
	const fonts = [
		{ value: 'inter', label: 'Inter' },
		{ value: 'roboto', label: 'Roboto' },
		{ value: 'lato', label: 'Lato' },
		{ value: 'poppins', label: 'Poppins' },
		{ value: 'nunito', label: 'Nunito' },
		{ value: 'openSans', label: 'Open Sans' }
	];

	let selectedTheme = $state('tactile');
	let selectedFont = $state('inter');
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
						userPrefersMode.current === 'system' && 'bg-accent fill-foreground'
					)}
					scale="md"
					onclick={() => setMode('system')}
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
						userPrefersMode.current === 'light' && 'bg-accent fill-foreground'
					)}
					scale="md"
					onclick={() => setMode('light')}
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
						userPrefersMode.current === 'dark' && 'bg-accent fill-foreground'
					)}
					scale="md"
					onclick={() => setMode('dark')}
				>
					<Icon name="moon" class="w-4 h-4" />
				</Button>
			</Tooltip>
		</div>
	</div>

	<div class="space-y-1">
		<Label class="text-sm">Theme</Label>
		<p class="text-muted-foreground text-xs">Change the theme of the app.</p>
		<div class="flex items-center gap-2 pt-2">
			<Select.Root type="single" bind:value={selectedTheme} items={themes}>
				<Select.Trigger>
					<Select.Value class="text-sm text-foreground/85" />
				</Select.Trigger>
				<Select.Content>
					{#each themes as theme (theme.value)}
						<Select.Item value={theme.value} label={theme.label}>{theme.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<Button
				variant="default"
				size="sm"
				class="h-7 text-primary-foreground/85 hover:text-primary-foreground text-sm font-normal"
				scale="sm"
				disabled
			>
				Browse
			</Button>
		</div>
	</div>

	<div class="space-y-1">
		<Label class="text-sm">Fonts</Label>
		<p class="text-muted-foreground text-xs">Change the interface font.</p>
		<div class="flex items-center gap-2 pt-2">
			<Select.Root type="single" bind:value={selectedFont} items={fonts} disabled>
				<Select.Trigger>
					<Select.Value class="text-sm text-foreground/85" />
				</Select.Trigger>
				<Select.Content>
					{#each fonts as font (font.value)}
						<Select.Item value={font.value} label={font.label}>{font.label}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</div>
</div>
