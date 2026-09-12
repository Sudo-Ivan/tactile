import { SIDEBAR } from '@/constants';
import { appState } from '@/store.svelte';
import type { Action } from 'svelte/action';

type SidebarTarget = 'page' | 'detail';

/**
 * Action for the sidebar drag border. Starts a resize session on mousedown and
 * tracks document level mousemove/mouseup until the drag ends.
 */
export const sidebarResize: Action<HTMLElement, SidebarTarget> = (node, target = 'page') => {
	const isPage = target === 'page';

	const getOpen = () => (isPage ? appState.isPageSidebarOpen : appState.isNoteDetailSidebarOpen);
	const setOpen = (value: boolean) => {
		if (isPage) appState.isPageSidebarOpen = value;
		else appState.isNoteDetailSidebarOpen = value;
	};
	const getWidth = () => (isPage ? appState.pageSidebarWidth : appState.noteDetailSidebarWidth);
	const setWidth = (value: number) => {
		if (isPage) appState.pageSidebarWidth = value;
		else appState.noteDetailSidebarWidth = value;
	};
	const setResizing = (value: boolean) => {
		if (isPage) appState.resizingPageSidebar = value;
		else appState.resizingNoteDetailSidebar = value;
	};

	const cursorBounds = isPage ? SIDEBAR.pageCursorBounds : SIDEBAR.detailCursorBounds;

	const handleMouseMove = (e: MouseEvent) => {
		setResizing(true);

		const x = e.x;
		const clientWidth = document.body.clientWidth;
		// Distance from the edge the sidebar is attached to
		const offset = isPage ? x : clientWidth - x;

		// Set collapsing bounds
		if (offset < SIDEBAR.collapseThreshold) {
			setResizing(false);
			setOpen(false);
			return;
		} else if (x > SIDEBAR.collapseThreshold && !getOpen()) {
			setResizing(false);
			setOpen(true);
			return;
		}

		// Set cursor resize bounds to prevent resizing when cursor is outside of the width bounds
		if (offset < cursorBounds.min || offset > cursorBounds.max) {
			return;
		}

		// Resize sidebar within the width bounds
		const newWidth = getWidth() + (isPage ? e.movementX : -e.movementX);
		if (newWidth >= SIDEBAR.minWidth && newWidth <= SIDEBAR.maxWidth) {
			setWidth(newWidth);
		}
	};

	const resizeHandler = () => {
		// Set resizing state
		setResizing(true);

		// Blur the editor
		appState.editor.instance?.commands.blur();

		// Set cusor-col-resize class to body
		document.body.classList.toggle('cursor-col-resize');

		// Mouse up event listener
		const handleMouseUp = () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);

			// Remove cursor-col-resize class from body
			document.body.classList.remove('cursor-col-resize');

			setResizing(false);
		};

		// Add event listeners
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	};

	node.addEventListener('mousedown', resizeHandler);

	return {
		destroy() {
			node.removeEventListener('mousedown', resizeHandler);
			document.removeEventListener('mousemove', handleMouseMove);
		}
	};
};
