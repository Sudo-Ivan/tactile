<script lang="ts">
	import { appTheme } from '@/store';
	import { Button } from '@tactile/ui/components/button';
	import Label from '@tactile/ui/components/label/label.svelte';
	import * as Select from '@tactile/ui/components/select';
	import { cn } from '@tactile/ui/lib/utils';
	import Icon from '../shared/icon.svelte';
	import Tooltip from '../shared/tooltip.svelte';

	let selectedTheme = 'tactile';
	let selectedFont = 'inter';
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
						$appTheme === 'auto' && 'bg-accent fill-foreground'
					)}
					scale="md"
					onclick={() => appTheme.set('auto')}
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
						$appTheme === 'light' && 'bg-accent fill-foreground'
					)}
					scale="md"
					onclick={() => appTheme.set('light')}
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
						$appTheme === 'dark' && 'bg-accent fill-foreground'
					)}
					scale="md"
					onclick={() => appTheme.set('dark')}
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
			<Select.Root type="single" bind:value={selectedTheme}>
				<Select.Trigger>
					<Select.Value class="text-sm text-foreground/85" />
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="tactile" label="Tactile">Tactile</Select.Item>
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
			<Select.Root type="single" bind:value={selectedFont} disabled>
				<Select.Trigger>
					<Select.Value class="text-sm text-foreground/85" />
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="inter" label="Inter">Inter</Select.Item>
					<Select.Item value="roboto" label="Roboto">Roboto</Select.Item>
					<Select.Item value="lato" label="Lato">Lato</Select.Item>
					<Select.Item value="poppins" label="Poppins">Poppins</Select.Item>
					<Select.Item value="nunito" label="Nunito">Nunito</Select.Item>
					<Select.Item value="openSans" label="Open Sans">Open Sans</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>
	</div>
</div>
