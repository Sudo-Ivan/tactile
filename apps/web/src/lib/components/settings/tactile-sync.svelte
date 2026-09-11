<script lang="ts">
	import { Button } from '@tactile/ui/components/button';
	import Label from '@tactile/ui/components/label/label.svelte';
	import * as Select from '@tactile/ui/components/select';
	import Switch from '@tactile/ui/components/switch/switch.svelte';
	import Tooltip from '../shared/tooltip.svelte';

	const syncIntervals = [
		{ value: '5m', label: '5 minutes' },
		{ value: '10m', label: '10 minutes' },
		{ value: '15m', label: '15 minutes' },
		{ value: '30m', label: '30 minutes' },
		{ value: '1h', label: '1 hour' },
		{ value: '2h', label: '2 hours' },
		{ value: '4h', label: '4 hours' },
		{ value: '6h', label: '6 hours' },
		{ value: '12h', label: '12 hours' },
		{ value: '24h', label: '24 hours' }
	];
	const backupIntervals = [
		{ value: '1w', label: '1 week' },
		{ value: '2w', label: '2 weeks' },
		{ value: '1m', label: '1 month' }
	];

	let autoSync = false;
	let autoBackup = false;
	let selectedSyncInterval = '5m';
	let selectedBackupInterval = '1w';
</script>

<div class="space-y-5">
	<div class="space-y-1">
		<Label class="text-sm">Auto sync</Label>
		<p class="text-muted-foreground text-xs">Automatically sync your notes.</p>
		<div class="flex items-center gap-2 pt-2">
			<Tooltip text="Coming soon">
				<Switch bind:checked={autoSync} disabled />
			</Tooltip>
		</div>
	</div>

	<div class="space-y-1">
		<Label class="text-sm">Sync interval</Label>
		<p class="text-muted-foreground text-xs">How often to sync your notes.</p>
		<div class="flex items-center gap-2 pt-2">
			<Select.Root
				type="single"
				bind:value={selectedSyncInterval}
				items={syncIntervals}
				disabled={!autoSync}
			>
				<Select.Trigger>
					<Select.Value class="text-sm text-foreground/85" />
				</Select.Trigger>
				<Select.Content>
					{#each syncIntervals as interval (interval.value)}
						<Select.Item value={interval.value} label={interval.label}>{interval.label}</Select.Item
						>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</div>

	<div class="space-y-1">
		<Label class="text-sm">Backups</Label>
		<p class="text-muted-foreground text-xs">Wheter or not to create scheduled backups.</p>
		<div class="flex items-center gap-2 pt-2">
			<Tooltip text="Coming soon">
				<Switch bind:checked={autoBackup} disabled />
			</Tooltip>
		</div>
	</div>

	<div class="space-y-1">
		<Label class="text-sm">Backup interval</Label>
		<p class="text-muted-foreground text-xs">How often to create backups of your notes.</p>
		<div class="flex items-center gap-2 pt-2">
			<Select.Root
				type="single"
				bind:value={selectedBackupInterval}
				items={backupIntervals}
				disabled={!autoBackup}
			>
				<Select.Trigger>
					<Select.Value class="text-sm text-foreground/85" />
				</Select.Trigger>
				<Select.Content>
					{#each backupIntervals as interval (interval.value)}
						<Select.Item value={interval.value} label={interval.label}>{interval.label}</Select.Item
						>
					{/each}
				</Select.Content>
			</Select.Root>

			<Button
				variant="default"
				size="sm"
				class="h-7 text-primary-foreground/85 hover:text-primary-foreground text-sm font-normal"
				scale="sm"
				disabled={!autoBackup}
			>
				Backup now
			</Button>
		</div>
	</div>
</div>
