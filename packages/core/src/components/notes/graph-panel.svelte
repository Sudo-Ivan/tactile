<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { buildNoteGraph, type GraphNode } from '../../api/graph';
	import { openNote } from '../../api/notes';
	import { appState } from '../../state/app.svelte';
	import { Button } from '@tactile/ui/components/button';
	import Tooltip from '../shared/tooltip.svelte';
	import {
		forceCenter,
		forceCollide,
		forceLink,
		forceManyBody,
		forceSimulation,
		type SimulationLinkDatum,
		type SimulationNodeDatum
	} from 'd3-force';
	import { quadtree, type Quadtree } from 'd3-quadtree';
	import { Maximize, Minus, Plus } from '@lucide/svelte';

	// Force-directed note graph: one node per note, edges from [[wikilinks]]
	// and markdown links. Dangling targets render as hollow nodes. Canvas
	// rendering with manual pan/zoom/drag keeps this cheap on big vaults.

	type SimNode = GraphNode & SimulationNodeDatum;
	type SimLink = SimulationLinkDatum<SimNode>;

	let canvas = $state<HTMLCanvasElement>();
	let wrap = $state<HTMLDivElement>();
	let empty = $state(false);
	let loading = $state(true);
	let stats = $state({ nodes: 0, links: 0 });

	let sim: ReturnType<typeof forceSimulation<SimNode>> | null = null;
	// Keep simulation data outside $state: d3 mutates x/y/vx/vy every tick
	// and Svelte proxies would tax each write.
	let tree: Quadtree<SimNode> | null = null;
	let treeDirty = true;
	let nodes: SimNode[] = [];
	let links: SimLink[] = [];
	let resizeObs: ResizeObserver | null = null;
	let themeObs: MutationObserver | null = null;
	let unsubscribeSaves: (() => void) | null = null;
	let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
	let drawQueued = false;

	// View transform: screen = world * scale + offset
	let view = { x: 0, y: 0, k: 1 };
	let dragNode: SimNode | null = null;
	let panning = false;
	let lastPointer = { x: 0, y: 0 };
	let downPos = { x: 0, y: 0 };
	let hoverNode: SimNode | null = null;
	// Canvas cursor follows the interaction state.
	let cursor = $state<'grab' | 'grabbing' | 'pointer'>('grab');

	interface Palette {
		node: string;
		active: string;
		dangling: string;
		link: string;
		label: string;
		activeLabel: string;
	}

	// Theme colors are read once and refreshed when the theme class flips;
	// getComputedStyle per frame is too expensive.
	let palette: Palette | null = null;

	function colors(): Palette {
		if (!palette) {
			const css = (name: string, alpha = 1) => {
				const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
				return alpha === 1 ? `hsl(${v})` : `hsl(${v} / ${alpha})`;
			};
			palette = {
				node: css('--foreground', 0.75),
				active: css('--primary'),
				dangling: css('--muted-foreground', 0.55),
				link: css('--border'),
				label: css('--muted-foreground'),
				activeLabel: css('--foreground')
			};
		}
		return palette;
	}

	function scheduleDraw() {
		if (drawQueued) return;
		drawQueued = true;
		requestAnimationFrame(() => {
			drawQueued = false;
			draw();
		});
	}

	function draw() {
		const ctx = canvas?.getContext('2d');
		if (!ctx || !canvas) return;
		const dpr = window.devicePixelRatio || 1;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
			canvas.width = w * dpr;
			canvas.height = h * dpr;
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);

		const c = colors();
		const sx = (x: number) => x * view.k + view.x;
		const sy = (y: number) => y * view.k + view.y;
		const showLabels = view.k > 1.6;

		ctx.strokeStyle = c.link;
		ctx.lineWidth = 1;
		ctx.beginPath();
		for (const l of links) {
			const s = l.source as SimNode;
			const t = l.target as SimNode;
			if (s.x == null || s.y == null || t.x == null || t.y == null) continue;
			ctx.moveTo(sx(s.x), sy(s.y));
			ctx.lineTo(sx(t.x), sy(t.y));
		}
		ctx.stroke();

		for (const n of nodes) {
			if (n.x == null || n.y == null) continue;
			const x = sx(n.x);
			const y = sy(n.y);
			const isActive = n.path === appState.activeFile;
			const r = isActive ? 7 : n === hoverNode ? 6 : 5;

			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			if (!n.exists) {
				ctx.strokeStyle = c.dangling;
				ctx.setLineDash([3, 3]);
				ctx.stroke();
				ctx.setLineDash([]);
			} else {
				ctx.fillStyle = isActive ? c.active : c.node;
				ctx.fill();
			}
			if (isActive || n === hoverNode || showLabels) {
				ctx.fillStyle = isActive ? c.activeLabel : c.label;
				ctx.font = '11px system-ui, sans-serif';
				ctx.textAlign = 'center';
				ctx.fillText(n.name, x, y + r + 13);
			}
		}
	}

	// Rebuilt lazily on pointer queries, not on every sim tick.
	function nodeAt(px: number, py: number): SimNode | null {
		if (treeDirty) {
			tree = quadtree<SimNode>()
				.x((d) => d.x ?? 0)
				.y((d) => d.y ?? 0)
				.addAll(nodes);
			treeDirty = false;
		}
		const wx = (px - view.x) / view.k;
		const wy = (py - view.y) / view.k;
		return tree?.find(wx, wy, 12 / view.k + 6) ?? null;
	}

	function toWorld(px: number, py: number) {
		return { x: (px - view.x) / view.k, y: (py - view.y) / view.k };
	}

	function localPos(e: MouseEvent) {
		const rect = canvas!.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		const p = localPos(e);
		lastPointer = p;
		downPos = p;
		dragNode = nodeAt(p.x, p.y);
		if (dragNode) {
			dragNode.fx = dragNode.x;
			dragNode.fy = dragNode.y;
			sim?.alphaTarget(0.1).restart();
			cursor = 'grabbing';
		} else {
			panning = true;
			cursor = 'grabbing';
		}
		canvas?.setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		const p = localPos(e);
		if (dragNode) {
			const w = toWorld(p.x, p.y);
			dragNode.fx = w.x;
			dragNode.fy = w.y;
		} else if (panning) {
			view.x += p.x - lastPointer.x;
			view.y += p.y - lastPointer.y;
			scheduleDraw();
		} else {
			const hit = nodeAt(p.x, p.y);
			if (hit !== hoverNode) {
				hoverNode = hit;
				cursor = hit ? 'pointer' : 'grab';
				scheduleDraw();
			}
		}
		lastPointer = p;
	}

	function onPointerUp(e: PointerEvent) {
		const p = localPos(e);
		const moved = Math.abs(p.x - downPos.x) + Math.abs(p.y - downPos.y);
		if (dragNode) {
			// A click (no drag) on a real note opens it.
			if (moved < 4 && dragNode.exists && dragNode.path) {
				void openNote(dragNode.path);
			}
			dragNode.fx = null;
			dragNode.fy = null;
			dragNode = null;
			sim?.alphaTarget(0);
		}
		panning = false;
		cursor = 'grab';
		canvas?.releasePointerCapture(e.pointerId);
	}

	function onPointerLeave() {
		if (dragNode || panning) return;
		hoverNode = null;
		cursor = 'grab';
		scheduleDraw();
	}

	const ZOOM_MIN = 0.2;
	const ZOOM_MAX = 4;

	function zoomAt(px: number, py: number, scale: number) {
		const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, view.k * scale));
		// Keep the anchor point stationary under the cursor.
		view.x = px - ((px - view.x) / view.k) * k;
		view.y = py - ((py - view.y) / view.k) * k;
		view.k = k;
		scheduleDraw();
	}

	function zoomStep(scale: number) {
		if (!canvas) return;
		zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, scale);
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const p = localPos(e);
		zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
	}

	// Frame every node with a margin; falls back to the panel center.
	function fitView() {
		if (!canvas || nodes.length === 0) return;
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const n of nodes) {
			if (n.x == null || n.y == null) continue;
			minX = Math.min(minX, n.x);
			minY = Math.min(minY, n.y);
			maxX = Math.max(maxX, n.x);
			maxY = Math.max(maxY, n.y);
		}
		if (!isFinite(minX)) return;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		const pad = 48;
		const bw = Math.max(1, maxX - minX);
		const bh = Math.max(1, maxY - minY);
		const k = Math.min(
			ZOOM_MAX,
			Math.max(ZOOM_MIN, Math.min((w - pad * 2) / bw, (h - pad * 2) / bh))
		);
		view.k = k;
		view.x = w / 2 - ((minX + maxX) / 2) * k;
		view.y = h / 2 - ((minY + maxY) / 2) * k;
		scheduleDraw();
	}

	async function load() {
		loading = true;
		const graph = await buildNoteGraph();
		loading = false;
		empty = graph.nodes.length === 0;
		stats = { nodes: graph.nodes.length, links: graph.links.length };
		if (empty) return;

		// Keep positions across rebuilds so the graph does not jump.
		const prev = new Map(nodes.map((n) => [n.id, n]));
		nodes = graph.nodes.map((n) => ({ ...prev.get(n.id), ...n }));
		links = graph.links.map((l) => ({ ...l }));
		treeDirty = true;

		const w = wrap?.clientWidth || 280;
		const h = wrap?.clientHeight || 300;
		for (const n of nodes) {
			if (n.x == null) {
				n.x = w / 2 + (Math.random() - 0.5) * 80;
				n.y = h / 2 + (Math.random() - 0.5) * 80;
			}
		}

		sim?.stop();
		sim = forceSimulation<SimNode>(nodes)
			.force(
				'link',
				forceLink<SimNode, SimLink>(links)
					.id((d) => d.id)
					.distance(90)
			)
			.force('charge', forceManyBody().strength(-160))
			.force('center', forceCenter(w / 2, h / 2))
			.force('collide', forceCollide(14))
			.on('tick', () => {
				treeDirty = true;
				scheduleDraw();
			});
	}

	// The active note highlight follows file switches without a rebuild.
	$effect(() => {
		void appState.activeFile;
		scheduleDraw();
	});

	onMount(() => {
		void load();
		resizeObs = new ResizeObserver(() => scheduleDraw());
		if (wrap) resizeObs.observe(wrap);
		// Repaint with fresh colors when the theme flips.
		themeObs = new MutationObserver(() => {
			palette = null;
			scheduleDraw();
		});
		themeObs.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'style', 'data-theme']
		});
		// Saves are debounced upstream; still batch them here since a
		// rebuild reads every note in the collection.
		unsubscribeSaves = appState.editor.subscribeToSaveEvents(() => {
			if (rebuildTimer) clearTimeout(rebuildTimer);
			rebuildTimer = setTimeout(() => void load(), 600);
		});
	});

	onDestroy(() => {
		sim?.stop();
		resizeObs?.disconnect();
		themeObs?.disconnect();
		unsubscribeSaves?.();
		if (rebuildTimer) clearTimeout(rebuildTimer);
	});
</script>

<div bind:this={wrap} class="relative w-full h-full min-h-[200px]">
	{#if loading}
		<div class="flex items-center justify-center w-full h-full">
			<p class="text-[13px] text-muted-foreground">Building graph...</p>
		</div>
	{:else if empty}
		<div class="flex items-center justify-center w-full h-full">
			<p class="text-[13px] text-muted-foreground">No notes yet</p>
		</div>
	{:else}
		<canvas
			bind:this={canvas}
			class="w-full h-full block touch-none"
			style:cursor
			aria-label="Note graph"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
			onpointerleave={onPointerLeave}
			onwheel={onWheel}
			ondblclick={fitView}
		></canvas>
		<p class="absolute bottom-2 left-3 text-[11px] text-muted-foreground pointer-events-none">
			{stats.nodes} notes, {stats.links} links
		</p>
		<div class="absolute bottom-2 right-2 flex flex-col gap-1">
			<Tooltip text="Zoom in" side="left">
				<Button
					size="icon"
					variant="ghost"
					scale="md"
					class="h-7 w-7 text-muted-foreground hover:text-foreground"
					onclick={() => zoomStep(1.3)}
					aria-label="Zoom in"
				>
					<Plus class="w-4 h-4" />
				</Button>
			</Tooltip>
			<Tooltip text="Zoom out" side="left">
				<Button
					size="icon"
					variant="ghost"
					scale="md"
					class="h-7 w-7 text-muted-foreground hover:text-foreground"
					onclick={() => zoomStep(1 / 1.3)}
					aria-label="Zoom out"
				>
					<Minus class="w-4 h-4" />
				</Button>
			</Tooltip>
			<Tooltip text="Fit graph to view" side="left">
				<Button
					size="icon"
					variant="ghost"
					scale="md"
					class="h-7 w-7 text-muted-foreground hover:text-foreground"
					onclick={fitView}
					aria-label="Fit graph to view"
				>
					<Maximize class="w-4 h-4" />
				</Button>
			</Tooltip>
		</div>
	{/if}
</div>
