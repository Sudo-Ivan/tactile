import { isMobile } from '@/platform.svelte';
import type { Action } from 'svelte/action';

const LONGPRESS_DURATION_MS = 500;
const LONGPRESS_MOVE_TOLERANCE_PX = 10;

// Fires a 'longpress' CustomEvent on the node after a sustained touch hold.
// The event detail carries the touch coordinates so handlers can open menus
// at the pressed point. On mobile, trusted contextmenu events are suppressed
// so the synthetic contextmenu dispatched by the longpress handler stays the
// single source that opens menus, and the click that follows the release of
// a long-press is swallowed so rows do not also trigger their tap action.
// The action is a no-op off mobile.
export const longpress: Action<HTMLElement> = (node) => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let fired = false;
	let startX = 0;
	let startY = 0;

	function cancel() {
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
	}

	function handleTouchStart(event: TouchEvent) {
		if (!isMobile) return;
		fired = false;
		const touch = event.touches[0];
		startX = touch.clientX;
		startY = touch.clientY;
		timer = setTimeout(() => {
			timer = undefined;
			fired = true;
			node.dispatchEvent(
				new CustomEvent('longpress', {
					detail: { x: startX, y: startY }
				})
			);
		}, LONGPRESS_DURATION_MS);
	}

	function handleTouchMove(event: TouchEvent) {
		if (timer === undefined) return;
		const touch = event.touches[0];
		if (
			Math.abs(touch.clientX - startX) > LONGPRESS_MOVE_TOLERANCE_PX ||
			Math.abs(touch.clientY - startY) > LONGPRESS_MOVE_TOLERANCE_PX
		) {
			cancel();
		}
	}

	function handleContextMenu(event: MouseEvent) {
		if (!isMobile || !event.isTrusted) return;
		// Suppress the native long-press context menu on the node so it cannot
		// reach menu triggers as a duplicate of the synthetic dispatch.
		event.preventDefault();
		event.stopPropagation();
	}

	function handleClick(event: MouseEvent) {
		if (!isMobile || !fired) return;
		// Swallow the click produced by releasing a long-press so the row does
		// not also run its tap action. Runs in capture phase so it lands before
		// the event reaches descendant buttons.
		fired = false;
		event.preventDefault();
		event.stopPropagation();
	}

	node.addEventListener('touchstart', handleTouchStart, { passive: true });
	node.addEventListener('touchmove', handleTouchMove, { passive: true });
	node.addEventListener('touchend', cancel);
	node.addEventListener('touchcancel', cancel);
	node.addEventListener('contextmenu', handleContextMenu);
	node.addEventListener('click', handleClick, { capture: true });

	return {
		destroy() {
			cancel();
			node.removeEventListener('touchstart', handleTouchStart);
			node.removeEventListener('touchmove', handleTouchMove);
			node.removeEventListener('touchend', cancel);
			node.removeEventListener('touchcancel', cancel);
			node.removeEventListener('contextmenu', handleContextMenu);
			node.removeEventListener('click', handleClick, { capture: true });
		}
	};
};
