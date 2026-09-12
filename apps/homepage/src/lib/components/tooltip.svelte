<script lang="ts">
	import { tooltipState } from '$lib/store.svelte';
	import * as Tooltip from '@tactile/ui/components/tooltip';
	import GithubLogo from './icons/github-logo.svelte';
	import RustLogo from './icons/rust-logo.svelte';
	import { Monitor, Smartphone, Tablet, Zap } from 'lucide-svelte';
	import { onMount, type Snippet } from 'svelte';

	type TooltipType = 'github' | 'privacy' | 'rust' | 'lightweight' | 'shortcuts';

	let { type = 'github', children }: { type?: TooltipType; children?: Snippet } = $props();

	let githubData = $state<{ stars: number; issues: number; forks: number }>({
		stars: 0,
		issues: 0,
		forks: 0
	});

	let isTouchDevice = $state(false);
	const tooltipId =
		Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

	let isOpen = $derived(tooltipState.currentOpenTooltip === tooltipId);

	onMount(() => {
		// Fetch GitHub stars
		fetch('https://api.github.com/repos/Sudo-Ivan/tactile')
			.then((response) => response.json())
			.then((data) => {
				githubData = {
					stars: data.stargazers_count,
					issues: data.open_issues,
					forks: data.forks_count
				};
			});

		// Check if the device is mobile
		isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
	});

	function handleInteraction(event: Event) {
		if (isTouchDevice) {
			event.preventDefault();
			tooltipState.currentOpenTooltip =
				tooltipState.currentOpenTooltip === tooltipId ? null : tooltipId;
		}
	}
</script>

<Tooltip.Root
	delayDuration={300}
	open={isTouchDevice ? isOpen : undefined}
	onOpenChange={(open) => {
		if (open) {
			tooltipState.tooltipsOpen += 1;
			if (isTouchDevice) {
				tooltipState.currentOpenTooltip = tooltipId;
			}
		} else {
			setTimeout(() => {
				tooltipState.tooltipsOpen -= 1;
			}, 500);
			if (isTouchDevice) {
				tooltipState.currentOpenTooltip = null;
			}
		}
	}}
>
	<Tooltip.Trigger onpointerdown={handleInteraction}>
		{#snippet child({ props })}
			<!-- Delegate trigger props to a span so we never emit a button
			     wrapper around the caller's content. -->
			<span {...props} class="inline">
				{@render children?.()}
			</span>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content sideOffset={0} class="text-sm h-7">
		{#if type === 'github'}
			<GithubLogo class="h-[15px] w-[15px]" />
			<!-- If all undefined due to ratelimit -->
			{#if githubData.stars === undefined && githubData.issues === undefined && githubData.forks === undefined}
				Transparent, community-driven and self-hostable
			{:else}
				{githubData.stars} Stars, {githubData.issues} Issues, {githubData.forks} Forks
			{/if}
		{:else if type === 'privacy'}
			Your <span class="glitch">data</span> never leaves your <Smartphone
				class="h-4 w-4 block -ml-0.5 sm:hidden"
			/><span class="-ml-1 sm:hidden">phone</span>
			<Tablet class="h-4 w-4 block -ml-0.5 hidden sm:inline xl:hidden" /><span
				class="-ml-0.5 hidden sm:inline xl:hidden">tablet</span
			>
			<Monitor class="h-4 w-4 block hidden xl:inline" /><span class="hidden xl:inline"
				>computer</span
			>
		{:else if type === 'rust'}
			<span class="hidden sm:inline">Instant responses. </span>Optimized for speed and performance
			<RustLogo class="w-5 h-5" />
		{:else if type === 'lightweight'}
			<Zap class="h-3.5 w-3.5 fill-foreground" /> below 15mb, no bloat.
		{:else if type === 'shortcuts'}
			Never leave your keyboard
			<span
				class="pointer-events-none inline-flex h-[18px] pl-1.5 tracking-widest -mr-2 select-none items-center gap-1 rounded bg-muted px-1 font-mono font-medium text-foreground/70 opacity-100"
			>
				⌘K
			</span>
		{/if}
	</Tooltip.Content>
</Tooltip.Root>

<style>
	.glitch {
		color: hsl(var(--foreground));
		position: relative;
		z-index: 10;
	}

	.glitch::before {
		left: 3px;
		text-shadow: -2px 0 red;
		animation-name: glitch-animation-1;
		animation-duration: 3s;
		animation-timing-function: linear;
		animation-delay: 0s;
		animation-iteration-count: infinite;
		animation-direction: reverse-alternate;
	}

	.glitch::after {
		left: -3px;
		text-shadow: -2px 0 blue;
		animation-name: glitch-animation-2;
		animation-duration: 3s;
		animation-timing-function: linear;
		animation-delay: 0s;
		animation-iteration-count: infinite;
		animation-direction: reverse-alternate;
	}

	.glitch::after,
	.glitch::before {
		color: hsl(var(--foreground));
		content: 'data';
		position: absolute;
		width: 100%;
		height: 55%;
		background: hsl(var(--secondary));
		overflow: hidden;
		top: 0;
	}

	@keyframes glitch-animation-1 {
		0% {
			clip: rect(13px, 140px, 15px, 0);
		}

		5% {
			clip: rect(5px, 140px, 16px, 0);
		}

		10% {
			clip: rect(16px, 140px, 6px, 0);
		}

		15% {
			clip: rect(19px, 140px, 13px, 0);
		}

		20% {
			clip: rect(6px, 140px, 18px, 0);
		}

		25% {
			clip: rect(12px, 140px, 5px, 0);
		}

		30% {
			clip: rect(4px, 140px, 20px, 0);
		}

		35% {
			clip: rect(6px, 140px, 8px, 0);
		}

		40% {
			clip: rect(17px, 140px, 7px, 0);
		}

		45% {
			clip: rect(19px, 140px, 3px, 0);
		}

		50% {
			clip: rect(6px, 140px, 5px, 0);
		}

		55% {
			clip: rect(3px, 140px, 13px, 0);
		}

		60% {
			clip: rect(15px, 140px, 14px, 0);
		}

		65% {
			clip: rect(14px, 140px, 14px, 0);
		}

		70% {
			clip: rect(8px, 140px, 15px, 0);
		}

		75% {
			clip: rect(14px, 140px, 14px, 0);
		}

		80% {
			clip: rect(12px, 140px, 19px, 0);
		}

		85% {
			clip: rect(2px, 140px, 14px, 0);
		}

		90% {
			clip: rect(12px, 140px, 5px, 0);
		}

		95% {
			clip: rect(7px, 140px, 1px, 0);
		}

		to {
			clip: rect(19px, 140px, 2px, 0);
		}
	}

	@keyframes glitch-animation-2 {
		0% {
			clip: rect(17px, 140px, 11px, 0);
		}

		5% {
			clip: rect(11px, 140px, 5px, 0);
		}

		10% {
			clip: rect(15px, 140px, 9px, 0);
		}

		15% {
			clip: rect(9px, 140px, 13px, 0);
		}

		20% {
			clip: rect(13px, 140px, 6px, 0);
		}

		25% {
			clip: rect(9px, 140px, 8px, 0);
		}

		30% {
			clip: rect(7px, 140px, 4px, 0);
		}

		35% {
			clip: rect(10px, 140px, 14px, 0);
		}

		40% {
			clip: rect(17px, 140px, 15px, 0);
		}

		45% {
			clip: rect(13px, 140px, 5px, 0);
		}

		50% {
			clip: rect(18px, 140px, 9px, 0);
		}

		55% {
			clip: rect(6px, 140px, 17px, 0);
		}

		60% {
			clip: rect(3px, 140px, 1px, 0);
		}

		65% {
			clip: rect(13px, 140px, 15px, 0);
		}

		70% {
			clip: rect(13px, 140px, 5px, 0);
		}

		75% {
			clip: rect(11px, 140px, 20px, 0);
		}

		80% {
			clip: rect(3px, 140px, 20px, 0);
		}

		85% {
			clip: rect(8px, 140px, 12px, 0);
		}

		90% {
			clip: rect(8px, 140px, 19px, 0);
		}

		95% {
			clip: rect(11px, 140px, 19px, 0);
		}

		to {
			clip: rect(4px, 140px, 18px, 0);
		}
	}
</style>
