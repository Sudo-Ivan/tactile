<script lang="ts">
	import Seo from '$lib/components/seo.svelte';
	import { Button } from '@tactile/ui/components/button';
	import { Check } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import { SPONSOR_URL } from '$lib/site';

	const plans = [
		{
			name: 'Free',
			price: '$0',
			period: 'forever',
			blurb: 'Everything you need. Your notes stay yours.',
			features: [
				'The full app, on web and desktop',
				'5 GB of sync storage',
				'Unlimited device-to-device and live sync',
				'Devices can stay offline for 90 days',
				'Files up to 16 MB each',
				'Self-host sync and publish for free'
			],
			cta: 'Download',
			href: resolve('/download'),
			accent: false
		},
		{
			name: 'Supporter',
			price: '$12',
			period: 'per year',
			blurb: 'More room for your notes, plus publishing.',
			features: [
				'Everything in Free',
				'100 GB of sync storage',
				'Devices can stay offline for 1 year',
				'Files up to 64 MB each',
				'Publish notes as public sites',
				'Supports development'
			],
			cta: 'Get Supporter',
			href: SPONSOR_URL,
			accent: true
		},
		{
			name: 'Pro',
			price: '$30',
			period: 'per year',
			blurb: 'Big libraries and heavy publishing.',
			features: [
				'Everything in Supporter',
				'500 GB of sync storage',
				'Devices can stay offline for 5 years',
				'Files up to 256 MB each',
				'More sites and custom domains',
				'Priority capacity on hosted servers'
			],
			cta: 'Get Pro',
			href: SPONSOR_URL,
			accent: false
		}
	];
</script>

<Seo
	title="Plans - Tactile"
	description="Tactile is free and open source. Paid plans add more sync storage and note publishing on hosted servers, never access to your data."
	path="/plans"
/>

<div class="z-10 w-full max-w-5xl flex flex-col items-center gap-10 py-6">
	<div class="text-center">
		<h1 class="text-4xl sm:text-5xl font-medium text-foreground font-['Gambarino-Regular']">
			Plans
		</h1>
		<p
			class="text-secondary-foreground/70 text-sm sm:text-base leading-relaxed mt-3 max-w-xl mx-auto"
		>
			Tactile is free and open source, always. Paid plans simply give you more room on our hosted
			sync and publishing servers. Everything works the same if you host it yourself.
		</p>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
		{#each plans as plan (plan.name)}
			<div
				class="rounded-xl border p-6 flex flex-col text-left {plan.accent
					? 'border-foreground/30 bg-background/60'
					: 'border-border/60 bg-background/40'}"
			>
				<h2 class="text-lg font-medium text-foreground">{plan.name}</h2>
				<p class="text-secondary-foreground/70 text-sm mt-1">{plan.blurb}</p>
				<div class="mt-4 flex items-baseline gap-1">
					<span class="text-3xl font-medium text-foreground">{plan.price}</span>
					<span class="text-secondary-foreground/60 text-sm">{plan.period}</span>
				</div>
				<ul class="mt-4 flex flex-col gap-2 text-sm text-secondary-foreground/80 flex-1">
					{#each plan.features as f (f)}
						<li class="flex items-start gap-2">
							<Check class="h-4 w-4 mt-0.5 shrink-0 text-foreground/60" />
							<span>{f}</span>
						</li>
					{/each}
				</ul>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={plan.href} class="mt-6">
					<Button
						scale="sm"
						variant={plan.accent ? 'default' : 'secondary'}
						class="rounded-full w-full select-none">{plan.cta}</Button
					>
				</a>
			</div>
		{/each}
	</div>

	<div class="w-full max-w-3xl text-left flex flex-col gap-6">
		<div class="rounded-xl border border-border/60 bg-background/40 p-6">
			<h3 class="text-foreground font-medium mb-2">How paying works</h3>
			<p class="text-secondary-foreground/70 text-sm leading-relaxed">
				You buy a code and paste it into the app. Done. There is no account to create and no email
				to hand over. Our servers only ever store encrypted data they cannot read, so a paid plan
				buys space, never access to your notes.
			</p>
		</div>
		<div class="rounded-xl border border-border/60 bg-background/40 p-6">
			<h3 class="text-foreground font-medium mb-2">Publishing</h3>
			<p class="text-secondary-foreground/70 text-sm leading-relaxed">
				Supporter and Pro can turn any note into a small public website with its own address, or
				your own domain. Sites count toward the same storage limit as sync, so there is only one
				number to think about.
			</p>
		</div>
		<div class="rounded-xl border border-border/60 bg-background/40 p-6">
			<h3 class="text-foreground font-medium mb-2">Self-host instead</h3>
			<p class="text-secondary-foreground/70 text-sm leading-relaxed">
				The sync server and the publish server are single open-source programs. Run them on a
				Raspberry Pi, a VPS, or your NAS and point Tactile at them. Self-hosting is always free, and
				your devices can use several servers at once.
			</p>
		</div>
		<div class="rounded-xl border border-border/60 bg-background/40 p-6">
			<h3 class="text-foreground font-medium mb-2">Fair questions</h3>
			<dl class="text-sm text-secondary-foreground/70 flex flex-col gap-3">
				<div>
					<dt class="text-foreground/90 font-medium">What happens when a plan ends?</dt>
					<dd>
						You go back to the free limits. Anything already synced stays until it expires
						naturally; nothing is deleted early.
					</dd>
				</div>
				<div>
					<dt class="text-foreground/90 font-medium">Do I have to sync or publish?</dt>
					<dd>No. Tactile works fully offline. Sync and publishing are optional extras.</dd>
				</div>
				<div>
					<dt class="text-foreground/90 font-medium">Can anyone else run a paid server?</dt>
					<dd>
						Yes. Anyone can run their own sync or publish server and set their own prices, free or
						paid.
					</dd>
				</div>
			</dl>
		</div>
	</div>
</div>
