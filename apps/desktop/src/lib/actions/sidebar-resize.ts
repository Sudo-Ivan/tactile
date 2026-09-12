import {
	SIDEBAR_COLLAPSE_THRESHOLD,
	SIDEBAR_CURSOR_MAX_OFFSET,
	SIDEBAR_CURSOR_MIN_OFFSET,
	SIDEBAR_MAX_WIDTH,
	SIDEBAR_MIN_WIDTH
} from '@/constants';
import { appState } from '@/store.svelte';
import type { Action } from 'svelte/action';

type SidebarTarget = 'page' | 'note-detail';

// Drag-resize action for the sidebars. 'page' is the left sidebar which grows
// to the right, 'note-detail' is the right sidebar which grows to the left.
export const sidebarResize: Action<HTMLElement, SidebarTarget> = (node, target) => {
	const isPageSidebar = target !== 'note-detail';

	const getWidth = () =>
		isPageSidebar ? appState.pageSidebarWidth : appState.noteDetailSidebarWidth;
	const setWidth = (value: number) => {
		if (isPageSidebar) {
			appState.pageSidebarWidth = value;
		} else {
			appState.noteDetailSidebarWidth = value;
		}
	};
	const getOpen = () =>
		isPageSidebar ? appState.isPageSidebarOpen : appState.isNoteDetailSidebarOpen;
	const setOpen = (value: boolean) => {
		if (isPageSidebar) {
			appState.isPageSidebarOpen = value;
		} else {
			appState.isNoteDetailSidebarOpen = value;
		}
	};
	const setResizing = (value: boolean) => {
		if (isPageSidebar) {
			appState.resizingPageSidebar = value;
		} else {
			appState.resizingNoteDetailSidebar = value;
		}
	};

	let startX: number | null = null;
	let startWidth = 0;

	const handleMouseMove = (e: MouseEvent) => {
		if (startX === null) return;
		setResizing(true);

		const x = e.clientX;
		// Distance from the sidebar edge to the window edge the sidebar is attached to
		const offset = isPageSidebar ? x : document.body.clientWidth - x;

		// Set collapsing bounds
		if (offset < SIDEBAR_COLLAPSE_THRESHOLD) {
			setResizing(false);
			setOpen(false);
			return;
		} else if (offset > SIDEBAR_COLLAPSE_THRESHOLD && !getOpen()) {
			setResizing(false);
			setOpen(true);
			return;
		}

		const diff = isPageSidebar ? x - startX : startX - x;
		const newWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, startWidth + diff));

		// Set cursor resize bounds to prevent resizing when cursor is outside of the width bounds
		if (offset < SIDEBAR_CURSOR_MIN_OFFSET || offset > SIDEBAR_CURSOR_MAX_OFFSET) {
			return;
		}

		setWidth(newWidth);
	};

	const handleMouseDown = (e: MouseEvent) => {
		e.preventDefault();
		startX = e.clientX;
		startWidth = getWidth();

		setResizing(true);
		appState.editor.instance?.commands.blur();
		document.body.classList.add('cursor-col-resize');

		const handleMouseUp = () => {
			startX = null;
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
			document.body.classList.remove('cursor-col-resize');
			setResizing(false);

			if (getWidth() < SIDEBAR_COLLAPSE_THRESHOLD) {
				setOpen(false);
			}
		};

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	};

	node.addEventListener('mousedown', handleMouseDown);

	return {
		destroy() {
			node.removeEventListener('mousedown', handleMouseDown);
		}
	};
};
