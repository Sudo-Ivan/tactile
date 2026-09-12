<script lang="ts">
	import { sidebarResize } from '@tactile/core/actions/sidebar-resize';
	import TaskEntries from '@tactile/core/components/tasks/task-entries.svelte';
	import { TASK_MARKER } from '@/constants';
	import { appState } from '@/store.svelte';
	import { searchEntries } from '@/utils';
	import { cn } from '@tactile/ui/lib/utils';
</script>

<div
	class={cn(
		'fixed left-12 h-[calc(100vh-4.5rem)] flex flex-col justify-start items-center bg-background overflow-y-auto transform transition-transform duration-300',
		!appState.isPageSidebarOpen && '-translate-x-52'
	)}
	style={`width: ${appState.pageSidebarWidth}px`}
>
	<!-- Drag border -->
	<div
		class="h-full w-1 border-r cursor-col-resize absolute top-0 right-0 z-10 hover:bg-foreground/10 hover:delay-75 transition-all duration-200 active:bg-foreground/20 active:!cursor-col-resize"
		use:sidebarResize={'page'}
		role="presentation"
	></div>

	<!-- Tasks -->
	<div
		class="flex flex-col items-start gap-1 w-full px-2 h-full overflow-auto pt-2 pb-4"
		data-collection-root
		data-path={appState.collection}
	>
		<TaskEntries
			searchTasks={() => searchEntries(appState.collection!, TASK_MARKER, { mode: 'exact' })}
		/>
	</div>
</div>

<style>
	:global(body.cursor-col-resize) {
		pointer-events: none;
	}
</style>
