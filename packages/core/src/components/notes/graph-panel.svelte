<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { buildNoteGraph, type GraphNode } from '../../api/graph';
	import { openNote } from '../../api/notes';
	import { appState } from '../../state/app.svelte';
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

	// Force-directed note graph: one node per note, edges from [[wikilinks]]
	// and markdown links. Dangling targets render as hollow nodes. Canvas
	// rendering with manual pan/zoom/drag keeps this cheap on big vaults.

	type SimNode = GraphNode & SimulationNodeDatum;
	type SimLink = SimulationLinkDatum<SimNode>;

	let canvas = $state<HTMLCanvasElement>();
	let wrap = $state<HTMLDivElement>();
	let empty = $state(false);
	let loading = $state(true);

	let sim: ReturnType<typeof forceSimulation<SimNode>> | null = null;
	let tree: Quadtree<SimNode> | null = null;
	let nodes = $state<SimNode[]>([]);
	let links = $state<SimLink[]>([]);
	let resizeObs: ResizeObserver | null = null;
	let unsubscribeSaves: (() => void) | null = null;

	// View transform: screen = world * scale + offset
	let view = { x: 0, y: 0, k: 1 };
	let dragNode: SimNode | null = null;
	let panning = false;
	let lastPointer = { x: 0, y: 0 };
	let downPos = { x: 0, y: 0 };
	let hoverNode: SimNode | null = null;

	function css(name: string, alpha = 1): string {
		const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
		return alpha === 1 ? `hsl(${v})` : `hsl(${v} / ${alpha})`;
	}

	function colors() {
		return {
			node: css('--foreground', 0.75),
			active: css('--primary'),
			dangling: css('--muted-foreground', 0.55),
			link: css('--border'),
			label: css('--muted-foreground'),
			activeLabel: css('--foreground')
		};
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

		ctx.strokeStyle = c.link;
		ctx.lineWidth = 1;
		for (const l of links) {
			const s = l.source as SimNode;
			const t = l.target as SimNode;
			if (s.x == null || s.y == null || t.x == null || t.y == null) continue;
			ctx.beginPath();
			ctx.moveTo(sx(s.x), sy(s.y));
			ctx.lineTo(sx(t.x), sy(t.y));
			ctx.stroke();
		}

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
			if (isActive || n === hoverNode || view.k > 1.6) {
				ctx.fillStyle = isActive ? c.activeLabel : c.label;
				ctx.font = '11px system-ui, sans-serif';
				ctx.textAlign = 'center';
				ctx.fillText(n.name, x, y + r + 13);
			}
		}
	}

	function rebuildTree() {
		tree = quadtree<SimNode>()
			.x((d) => d.x ?? 0)
			.y((d) => d.y ?? 0)
			.addAll(nodes);
	}

	function nodeAt(px: number, py: number): SimNode | null {
		if (!tree) return null;
		const wx = (px - view.x) / view.k;
		const wy = (py - view.y) / view.k;
		const hit = tree.find(wx, wy, 12 / view.k + 6);
		return hit ?? null;
	}

	function toWorld(px: number, py: number) {
		return { x: (px - view.x) / view.k, y: (py - view.y) / view.k };
	}

	function localPos(e: MouseEvent) {
		const rect = canvas!.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function onPointerDown(e: PointerEvent) {
		const p = localPos(e);
		lastPointer = p;
		downPos = p;
		dragNode = nodeAt(p.x, p.y);
		if (dragNode) {
			dragNode.fx = dragNode.x;
			dragNode.fy = dragNode.y;
			sim?.alphaTarget(0.1).restart();
		} else {
			panning = true;
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
			draw();
		} else {
			hoverNode = nodeAt(p.x, p.y);
			canvas!.style.cursor = hoverNode ? 'pointer' : 'grab';
			draw();
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
		canvas?.releasePointerCapture(e.pointerId);
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const p = localPos(e);
		const scale = Math.exp(-e.deltaY * 0.0015);
		const k = Math.min(4, Math.max(0.2, view.k * scale));
		// Zoom around the cursor.
		view.x = p.x - ((p.x - view.x) / view.k) * k;
		view.y = p.y - ((p.y - view.y) / view.k) * k;
		view.k = k;
		draw();
	}

	async function load() {
		loading = true;
		const graph = await buildNoteGraph();
		loading = false;
		empty = graph.nodes.length === 0;
		if (empty) return;

		// Keep positions across rebuilds so the graph does not jump.
		const prev = new Map(nodes.map((n) => [n.id, n]));
		nodes = graph.nodes.map((n) => ({ ...prev.get(n.id), ...n }));
		links = graph.links.map((l) => ({ ...l }));

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
				rebuildTree();
				draw();
			});
	}

	onMount(() => {
		void load();
		resizeObs = new ResizeObserver(() => draw());
		if (wrap) resizeObs.observe(wrap);
		canvas?.addEventListener('pointerdown', onPointerDown);
		canvas?.addEventListener('pointermove', onPointerMove);
		canvas?.addEventListener('pointerup', onPointerUp);
		canvas?.addEventListener('wheel', onWheel, { passive: false });
		unsubscribeSaves = appState.editor.subscribeToSaveEvents(() => void load());
	});

	onDestroy(() => {
		sim?.stop();
		resizeObs?.disconnect();
		unsubscribeSaves?.();
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
		<canvas bind:this={canvas} class="w-full h-full block" aria-label="Note graph"></canvas>
		<p class="absolute bottom-2 left-3 text-[11px] text-muted-foreground pointer-events-none">
			{nodes.length} notes, {links.length} links
		</p>
	{/if}
</div>
