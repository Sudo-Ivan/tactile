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
			blurb: 'Local-first notes plus community relay sync.',
			features: [
				'Full app, web and desktop',
				'64 MiB relay storage',
				'30-day blob retention',
				'1 MiB max blob',
				'Run your own relay, free'
			],
			cta: 'Download',
			href: resolve('/download'),
			accent: false
		},
		{
			name: 'Supporter',
			price: '$12',
			period: 'per year',
			blurb: 'For people who keep a device off for a while.',
			features: [
				'Everything in Free',
				'256 MiB relay storage',
				'90-day blob retention',
				'4 MiB max blob, enough for images',
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
			blurb: 'Heavy vaults and long-offline devices.',
			features: [
				'Everything in Supporter',
				'1 GiB relay storage',
				'1-year blob retention',
				'8 MiB max blob',
				'Priority capacity on hosted relays'
			],
			cta: 'Get Pro',
			href: SPONSOR_URL,
			accent: false
		}
	];
</script>

<Seo
	title="Plans - Tactile"
	description="Tactile is free and open source. Optional paid sync tiers buy more relay capacity, not your data."
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
			The app is free and open source, always. Paid tiers buy capacity on the hosted relays, and
			everything works the same if you run your own.
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
			<h3 class="text-foreground font-medium mb-2">How paid sync works</h3>
			<p class="text-secondary-foreground/70 text-sm leading-relaxed">
				You buy a code, you paste it into the app, done. The code is a signed token that grants
				quota and retention on our relays. There is no account to create, no email to give, and the
				relay cannot read your notes either way - everything it stores is already encrypted on your
				device.
			</p>
		</div>
		<div class="rounded-xl border border-border/60 bg-background/40 p-6">
			<h3 class="text-foreground font-medium mb-2">Self-host instead</h3>
			<p class="text-secondary-foreground/70 text-sm leading-relaxed">
				The relay is a single open-source Go binary with filesystem or S3 storage. Run it on a
				Raspberry Pi, a VPS, or your NAS and point Tactile at it. Self-hosted relays are fully free,
				and your devices can use several relays at once.
			</p>
		</div>
		<div class="rounded-xl border border-border/60 bg-background/40 p-6">
			<h3 class="text-foreground font-medium mb-2">Fair questions</h3>
			<dl class="text-sm text-secondary-foreground/70 flex flex-col gap-3">
				<div>
					<dt class="text-foreground/90 font-medium">What happens when a plan lapses?</dt>
					<dd>
						Your blobs keep their remaining retention and you drop back to free-tier limits. Nothing
						is deleted early.
					</dd>
				</div>
				<div>
					<dt class="text-foreground/90 font-medium">Is sync required?</dt>
					<dd>No. Tactile is fully local-first; sync is optional and self-hostable.</dd>
				</div>
				<div>
					<dt class="text-foreground/90 font-medium">Can anyone else run a paid relay?</dt>
					<dd>
						Yes. Tokens are minted with an operator secret, so independent relay operators can run
						their own paid tiers.
					</dd>
				</div>
			</dl>
		</div>
	</div>
</div>
