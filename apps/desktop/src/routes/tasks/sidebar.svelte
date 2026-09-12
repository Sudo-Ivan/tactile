<script lang="ts">
	import { sidebarResize } from '@/actions/sidebar-resize';
	import { isMobile } from '@/platform.svelte';
	import { appState } from '@/store.svelte';
	import { cn } from '@tactile/ui/lib/utils';
	import TaskEntries from './task-entries.svelte';
</script>

<div
	class={cn(
		'fixed flex flex-col justify-start items-center bg-background overflow-y-auto transform transition-transform duration-300',
		isMobile
			? 'left-0 top-0 w-full z-30 bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))]'
			: cn(
					'left-12',
					!appState.isPageSidebarOpen && '-translate-x-52',
					appState.platform === 'darwin' ? 'h-[calc(100vh-4.5rem)]' : 'h-[calc(100vh-2.25rem)]'
				)
	)}
	style={isMobile ? undefined : `width: ${appState.pageSidebarWidth}px`}
>
	<!-- Drag border -->
	{#if !isMobile}
		<div
			class="h-full w-1 border-r cursor-col-resize absolute top-0 right-0 z-10 hover:bg-foreground/10 hover:delay-75 transition-all duration-200 active:bg-foreground/20 active:!cursor-col-resize"
			use:sidebarResize={'page'}
			role="presentation"
		></div>
	{/if}

	<!-- Tasks -->
	<div
		class="flex flex-col items-start gap-1 w-full px-2 h-full overflow-auto pt-2 pb-4"
		data-collection-root
		data-path={appState.collection}
	>
		<TaskEntries />
	</div>
</div>
