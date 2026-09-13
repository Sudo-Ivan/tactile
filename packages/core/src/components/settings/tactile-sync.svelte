<script lang="ts">
	import { getIdentity } from '../../api/identity';
	import { setSettings } from '../../api/settings';
	import {
		applySyncSettings,
		exportSyncCode,
		importSyncCode,
		syncNow,
		testRelay
	} from '../../api/sync';
	import { SYNC_SERVER_PLACEHOLDER } from '../../constants';
	import { appState } from '../../state/app.svelte';
	import { syncState, syncStatusText } from '../../state/sync.svelte';
	import { Button } from '@tactile/ui/components/button';
	import * as Collapsible from '@tactile/ui/components/collapsible';
	import { Input } from '@tactile/ui/components/input';
	import Label from '@tactile/ui/components/label/label.svelte';
	import * as Select from '@tactile/ui/components/select';
	import Switch from '@tactile/ui/components/switch/switch.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import { Check, ChevronRight, Copy, Eye, EyeOff, RefreshCw } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import Tooltip from '../shared/tooltip.svelte';

	let advancedOpen = $state(false);
	let testing = $state(false);
	let testResult = $state('');

	let syncServer = $derived(appState.appSettings.sync_server ?? '');
	let syncServerValid = $derived(syncServer === '' || /^https?:\/\/\S+$/.test(syncServer.trim()));

	function setSyncServer(value: string) {
		setSettings('app', { ...appState.appSettings, sync_server: value.trim() });
	}

	function setSyncEnabled(value: boolean) {
		setSettings('app', { ...appState.appSettings, sync_enabled: value }).then(applySyncSettings);
	}

	function setSyncInterval(value: string) {
		if (!value) return;
		setSettings('app', {
			...appState.appSettings,
			sync_interval_minutes: Number(value)
		}).then(applySyncSettings);
	}

	async function runSync() {
		await syncNow();
	}

	async function runTest() {
		testing = true;
		testResult = '';
		try {
			const info = await testRelay();
			testResult = `Connected to relay ${info.relay_id} (protocol v${info.version}, storage ${info.load.storage_used_pct}% used)`;
		} catch (e) {
			testResult = `Connection failed: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			testing = false;
		}
	}

	// ---------------------------------------------------------------- identity

	let publicKey = $state('');
	let copiedKey = $state(false);

	onMount(async () => {
		publicKey = (await getIdentity()).publicKeyHex;
	});

	function copyPublicKey() {
		if (!publicKey) return;
		navigator.clipboard.writeText(publicKey);
		copiedKey = true;
		setTimeout(() => (copiedKey = false), 1500);
	}

	// ---------------------------------------------------------------- pairing

	let syncCode = $state('');
	let codeVisible = $state(false);
	let copiedCode = $state(false);
	let importValue = $state('');
	let importError = $state('');
	let importConfirm = $state(false);
	let importDone = $state('');

	async function toggleCode() {
		if (!codeVisible && !syncCode) {
			syncCode = await exportSyncCode();
		}
		codeVisible = !codeVisible;
	}

	function copySyncCode() {
		if (!syncCode) return;
		navigator.clipboard.writeText(syncCode);
		copiedCode = true;
		setTimeout(() => (copiedCode = false), 1500);
	}

	async function linkDevice() {
		importError = '';
		importDone = '';
		if (!importValue.trim()) return;
		// Two-step confirm: importing replaces this device's identity.
		if (!importConfirm) {
			importConfirm = true;
			return;
		}
		try {
			const pub = await importSyncCode(importValue);
			publicKey = pub;
			importValue = '';
			importDone = `Linked. This device now syncs as ${pub.slice(0, 12)}...`;
		} catch (e) {
			importError = e instanceof Error ? e.message : String(e);
		} finally {
			importConfirm = false;
		}
	}
</script>

<div class="space-y-5">
	<div class="space-y-1">
		<Label class="text-sm">Sync</Label>
		<p class="text-muted-foreground text-xs">
			Sync this collection across devices through a relay. The relay only ever stores end-to-end
			encrypted blobs, so it cannot read your notes. Collections with the same name sync together.
		</p>
		<div class="flex items-center gap-2 pt-2">
			<Tooltip text={appState.collection ? 'Sync this collection now' : 'Open a collection first'}>
				<Button
					variant="default"
					size="sm"
					class="h-8 text-primary-foreground/85 hover:text-primary-foreground text-sm font-normal gap-1.5"
					scale="sm"
					disabled={syncState.status === 'syncing' || !appState.collection}
					onclick={runSync}
				>
					<RefreshCw class={cn('h-3.5 w-3.5', syncState.status === 'syncing' && 'animate-spin')} />
					{syncState.status === 'syncing' ? 'Syncing...' : 'Sync now'}
				</Button>
			</Tooltip>
			<span
				class={cn(
					'text-xs',
					syncState.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
				)}
			>
				{syncStatusText()}
			</span>
		</div>
		{#if syncState.stats && syncState.lastOk}
			<p class="text-muted-foreground text-xs pt-1">
				{syncState.stats.uploaded} uploaded, {syncState.stats.downloaded} downloaded{syncState.stats
					.conflicts > 0
					? `, ${syncState.stats.conflicts} conflict${syncState.stats.conflicts > 1 ? 's' : ''} kept`
					: ''}{syncState.stats.deletedLocal + syncState.stats.deletedRemote > 0
					? `, ${syncState.stats.deletedLocal + syncState.stats.deletedRemote} deleted`
					: ''}
			</p>
		{/if}
	</div>

	<div class="space-y-1">
		<Label class="text-sm">Auto sync</Label>
		<p class="text-muted-foreground text-xs">Sync this collection on an interval.</p>
		<div class="flex items-center gap-2 pt-2">
			<Switch checked={appState.appSettings.sync_enabled} onCheckedChange={setSyncEnabled} />
		</div>
	</div>

	<div class="space-y-1">
		<Label class="text-sm">Sync interval</Label>
		<p class="text-muted-foreground text-xs">How often to sync your notes.</p>
		<div class="flex items-center gap-2 pt-2">
			<Select.Root
				type="single"
				value={String(appState.appSettings.sync_interval_minutes)}
				onValueChange={setSyncInterval}
				disabled={!appState.appSettings.sync_enabled}
			>
				<Select.Trigger>
					<Select.Value class="text-sm text-foreground/85" />
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="1" label="Every minute">Every minute</Select.Item>
					<Select.Item value="5" label="5 minutes">5 minutes</Select.Item>
					<Select.Item value="10" label="10 minutes">10 minutes</Select.Item>
					<Select.Item value="15" label="15 minutes">15 minutes</Select.Item>
					<Select.Item value="30" label="30 minutes">30 minutes</Select.Item>
					<Select.Item value="60" label="1 hour">1 hour</Select.Item>
					<Select.Item value="360" label="6 hours">6 hours</Select.Item>
					<Select.Item value="720" label="12 hours">12 hours</Select.Item>
					<Select.Item value="1440" label="24 hours">24 hours</Select.Item>
				</Select.Content>
			</Select.Root>
		</div>
	</div>

	<div class="space-y-1">
		<Label class="text-sm">Your identity</Label>
		<p class="text-muted-foreground text-xs">
			The public key that identifies this install to sync relays and publish nodes. Private nodes
			require it on their allowlist. Generated once and stored on this device.
		</p>
		<div class="flex items-center gap-2 pt-2">
			<Input
				value={publicKey}
				readonly
				spellcheck="false"
				autocomplete="off"
				class="h-8 text-sm font-mono flex-1"
				placeholder="Generating identity..."
			/>
			<Button
				variant="secondary"
				size="sm"
				class="h-8 text-sm font-normal gap-1.5"
				scale="sm"
				disabled={publicKey === ''}
				onclick={copyPublicKey}
			>
				{#if copiedKey}
					<Check class="h-3.5 w-3.5" />
					Copied
				{:else}
					<Copy class="h-3.5 w-3.5" />
					Copy
				{/if}
			</Button>
		</div>
	</div>

	<div class="space-y-1">
		<Label class="text-sm">Link another device</Label>
		<p class="text-muted-foreground text-xs">
			On the other device open Settings, Tactile Sync, and copy its sync code, then paste it here.
			Both devices then share one identity and one encrypted sync space. Anyone with the code can
			read and write your synced notes, so treat it like a password.
		</p>
		<div class="flex items-center gap-2 pt-2">
			<Button
				variant="secondary"
				size="sm"
				class="h-8 text-sm font-normal gap-1.5"
				scale="sm"
				onclick={toggleCode}
			>
				{#if codeVisible}
					<EyeOff class="h-3.5 w-3.5" />
					Hide sync code
				{:else}
					<Eye class="h-3.5 w-3.5" />
					Show my sync code
				{/if}
			</Button>
			{#if codeVisible}
				<Button
					variant="secondary"
					size="sm"
					class="h-8 text-sm font-normal gap-1.5"
					scale="sm"
					onclick={copySyncCode}
				>
					{#if copiedCode}
						<Check class="h-3.5 w-3.5" />
						Copied
					{:else}
						<Copy class="h-3.5 w-3.5" />
						Copy
					{/if}
				</Button>
			{/if}
		</div>
		{#if codeVisible}
			<Input
				value={syncCode}
				readonly
				spellcheck="false"
				autocomplete="off"
				class="h-8 text-sm font-mono flex-1 mt-2"
			/>
		{/if}
		<div class="flex items-center gap-2 pt-2">
			<Input
				bind:value={importValue}
				placeholder="tactilesync1:..."
				spellcheck="false"
				autocomplete="off"
				class={cn(
					'h-8 text-sm font-mono flex-1',
					importError && 'border-destructive focus-visible:ring-destructive'
				)}
				oninput={() => {
					importError = '';
					importConfirm = false;
				}}
			/>
			<Button
				variant={importConfirm ? 'default' : 'secondary'}
				size="sm"
				class="h-8 text-sm font-normal"
				scale="sm"
				disabled={importValue.trim() === ''}
				onclick={linkDevice}
			>
				{importConfirm ? 'Confirm replace' : 'Link this device'}
			</Button>
		</div>
		{#if importConfirm}
			<p class="text-destructive text-xs pt-1">
				This replaces this device's identity with the one in the code. Click again to confirm.
			</p>
		{/if}
		{#if importError}
			<p class="text-destructive text-xs pt-1">{importError}</p>
		{/if}
		{#if importDone}
			<p class="text-muted-foreground text-xs pt-1">{importDone}</p>
		{/if}
	</div>

	<Collapsible.Root bind:open={advancedOpen} class="pt-3 border-t border-border/60">
		<Collapsible.Trigger
			class="flex items-center gap-1.5 text-sm text-foreground/85 hover:text-foreground transition-colors"
		>
			<ChevronRight class={cn('h-3.5 w-3.5 transition-transform', advancedOpen && 'rotate-90')} />
			Advanced
		</Collapsible.Trigger>
		<Collapsible.Content class="pt-3">
			<div class="space-y-1">
				<Label class="text-sm">Sync server</Label>
				<p class="text-muted-foreground text-xs">
					Custom Tactile Sync relay endpoint. Leave empty to use the default hosted relay.
				</p>
				<div class="flex items-center gap-2 pt-2">
					<Input
						value={syncServer}
						oninput={(e) => setSyncServer(e.currentTarget.value)}
						placeholder={SYNC_SERVER_PLACEHOLDER}
						spellcheck="false"
						autocomplete="off"
						class={cn(
							'h-8 text-sm font-mono flex-1',
							!syncServerValid && 'border-destructive focus-visible:ring-destructive'
						)}
					/>
					<Button
						variant="secondary"
						size="sm"
						class="h-8 text-sm font-normal"
						scale="sm"
						disabled={syncServer === ''}
						onclick={() => setSyncServer('')}
					>
						Reset
					</Button>
				</div>
				{#if !syncServerValid}
					<p class="text-destructive text-xs pt-1">Must be a valid http(s) URL.</p>
				{/if}
				<div class="flex items-center gap-2 pt-2">
					<Button
						variant="secondary"
						size="sm"
						class="h-8 text-sm font-normal"
						scale="sm"
						disabled={testing || !syncServerValid}
						onclick={runTest}
					>
						{testing ? 'Testing...' : 'Test connection'}
					</Button>
				</div>
				{#if testResult}
					<p
						class={cn(
							'text-xs pt-1',
							testResult.startsWith('Connected') ? 'text-muted-foreground' : 'text-destructive'
						)}
					>
						{testResult}
					</p>
				{/if}
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
</div>
