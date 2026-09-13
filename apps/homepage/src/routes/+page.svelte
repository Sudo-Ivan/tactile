<script lang="ts">
	import Tooltip from '$lib/components/tooltip.svelte';
	import Seo from '$lib/components/seo.svelte';
	import { Button } from '@tactile/ui/components/button';
	import banner from '$lib/assets/hero-dark.png';

	import { APP_URL, REPO_URL } from '$lib/site';
	import { resolve } from '$app/paths';

	import { ArrowUpRight, FileText, Lock, RefreshCw, Code } from 'lucide-svelte';

	const features = [
		{
			icon: FileText,
			title: 'Plain markdown',
			text: 'Notes are real .md files on disk or in the browser. No database lock-in, export anytime.'
		},
		{
			icon: Lock,
			title: 'Private by default',
			text: 'Local-first with no account, no email, no tracking. Your notes never leave your devices unless you turn on sync.'
		},
		{
			icon: RefreshCw,
			title: 'Sync without accounts',
			text: 'Optional end-to-end encrypted sync through blind relays. The server stores only signed ciphertext.'
		},
		{
			icon: Code,
			title: 'Open and hackable',
			text: 'AGPL source, self-hostable relay, open protocol. Run your own sync node if you want full control.'
		}
	];
</script>

<Seo
	title="Tactile - Local-first markdown notes"
	description="Local-first, privacy-focused markdown notes. Optional end-to-end encrypted sync with no accounts and no email."
	path="/"
/>

<svelte:head>
	<link rel="preload" href={banner} as="image" />
</svelte:head>

<h1
	class="text-5xl sm:text-6xl font-medium text-foreground font-['Gambarino-Regular'] text-center z-10"
>
	Write notes at the speed of touch
</h1>

<p class="text-secondary-foreground/70 text-center leading-relaxed text-sm sm:text-base z-10">
	Tactile is a
	<Tooltip type="privacy">
		<span class="cursor-not-allowed">local-first & privacy-focused</span>,
	</Tooltip>
	<Tooltip type="github">
		<span class="cursor-help">open-source</span>
	</Tooltip>
	home for your markdown notes.<br class="hidden md:block" />
	Minimal,
	<Tooltip type="lightweight">
		<span class="cursor-copy">lightweight</span></Tooltip
	> and

	<Tooltip type="rust">
		<span class="cursor-wait">fast</span>
	</Tooltip>, with encrypted sync when you want it.
</p>

<div class="flex items-center justify-center gap-4 z-10 mt-2">
	<a href={resolve('/download')}>
		<Button scale="sm" class="rounded-full select-none">Download</Button>
	</a>
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a href={REPO_URL} target="_blank" rel="noopener noreferrer">
		<Button scale="sm" variant="secondary" class="rounded-full select-none">Learn More</Button>
	</a>
</div>

<div class="relative mx-auto w-full flex max-w-4xl flex-col items-center text-center mt-5">
	<span
		class="-inset-x-1/4 top-4 h-1/4 rounded-3xl bg-foreground/50 dark:bg-muted/30 blur-3xl absolute"
	></span>
	<div class="relative xl:-mx-36">
		<div
			class="relative flex min-h-full h-full w-full items-center justify-center overflow-hidden rounded-lg md:rounded-xl bg-neutral-950 border"
		>
			<img
				src={banner}
				alt="Tactile screenshot"
				class="rounded-[inherit] opacity-45 grayscale z-10"
			/>
		</div>
		<div
			class="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-transparent to-neutral-950 rounded-lg md:rounded-xl z-10"
		>
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={APP_URL}
				target="_blank"
				rel="noopener noreferrer"
				class="group overflow-hidden rounded-full border border-primary-foreground/10 dark:border-border bg-background/5 dark:bg-background dark:brightness-110 backdrop-blur-sm transition hover:scale-[1.05]"
			>
				<div
					class="m-2.5 sm:m-3.5 flex items-center justify-center rounded-full border border-primary-foreground/15 dark:border-border bg-gradient-to-b from-neutral-800 to-neutral-700 p-3.5 sm:p-5 shadow-xl transition group-hover:scale-[1.06] backdrop-blur-md"
				>
					<ArrowUpRight
						class="h-5 w-5 sm:w-6 sm:h-6 stroke-[1.5px] text-primary-foreground/50 dark:text-foreground/40 group-hover:text-primary-foreground/60 dark:group-hover:text-foreground/60 group-hover:scale-105 transition-all"
					/>
				</div>
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</div>
	</div>
</div>

<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl mt-16 z-10">
	{#each features as f (f.title)}
		<div class="rounded-xl border border-border/60 bg-background/40 p-5 text-left">
			<f.icon class="h-5 w-5 text-foreground/70 mb-3" />
			<h3 class="text-foreground font-medium mb-1">{f.title}</h3>
			<p class="text-secondary-foreground/70 text-sm leading-relaxed">{f.text}</p>
		</div>
	{/each}
</div>

<div
	class="mt-14 w-full max-w-3xl rounded-xl border border-border/60 bg-background/40 p-6 sm:p-8 text-left z-10"
>
	<h2 class="text-2xl font-medium text-foreground font-['Gambarino-Regular']">
		Sync, on your terms
	</h2>
	<p class="text-secondary-foreground/70 text-sm sm:text-base leading-relaxed mt-2">
		Tactile syncs through blind relays that store only signed ciphertext. Use the hosted relay, or
		run your own relay on anything with a disk or an S3 bucket. No email, no account, no lock-in.
	</p>
</div>
