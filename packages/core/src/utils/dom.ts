// Open the wrapping ContextMenu on long-press by dispatching a synthetic
// contextmenu event that bubbles up to the ContextMenu.Trigger element.
export function dispatchContextMenu(event: CustomEvent<{ x: number; y: number }>) {
	(event.currentTarget as HTMLElement).dispatchEvent(
		new MouseEvent('contextmenu', {
			bubbles: true,
			cancelable: true,
			clientX: event.detail.x,
			clientY: event.detail.y
		})
	);
}
