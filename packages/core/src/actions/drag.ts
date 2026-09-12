import { moveFolder } from '../api/folders';
import { moveNote } from '../api/notes';
import { DRAG_PREVIEW_Z_INDEX } from '../constants';

// Drag-and-drop handling for sidebar entries. Notes and folders are moved onto
// the highlighted drop target in the file tree on drag end.
export function createEntryDrag() {
	let dragItem: HTMLElement | null = null; // Reference to the original element being dragged
	let dragPreviewItem: HTMLElement | null = null; // Reference to the custom drag preview element
	let previousHighlightedElement: HTMLElement | null = null;

	// Function to handle drag start
	function handleDragStart(event: DragEvent, filename: string) {
		// Specify the effect allowed for the drag
		event.dataTransfer!.effectAllowed = 'move';

		// Set dragItem to the original element being dragged
		dragItem = event.currentTarget as HTMLElement;

		// Create a custom drag preview element
		dragPreviewItem = document.createElement('div');
		dragPreviewItem.classList.add('drag-item');
		dragPreviewItem.style.zIndex = String(DRAG_PREVIEW_Z_INDEX);
		dragPreviewItem.textContent = filename;
		document.body.appendChild(dragPreviewItem);

		// Set the opacity of the original element
		(event.currentTarget as HTMLElement).style.opacity = '0.5';

		// Set the drag image to the custom element
		event.dataTransfer?.setDragImage(dragPreviewItem, 0, 0);

		// Add dragover event listener to document
		document.addEventListener('dragover', handleDragOver);
	}

	// Function to handle drag over
	function handleDragOver(event: DragEvent) {
		const element = event.target as HTMLElement;
		let highlightElement: HTMLElement | null = null;

		// Check for collapsible root
		const collapsibleTriggerElement = element.closest('[data-collapsible-root]');
		if (collapsibleTriggerElement) {
			if (
				dragItem?.hasAttribute('data-is-folder') &&
				collapsibleTriggerElement === dragItem?.closest('[data-collapsible-root]')
			) {
				// Select the next collapsible root parent, if none select the collection root itself
				let parentElement: HTMLElement | null = collapsibleTriggerElement.parentElement;

				// Loop through the parent elements until finding a root collapsible parent
				while (parentElement) {
					if (parentElement !== dragItem?.closest('[data-collapsible-root]')) {
						if (parentElement.hasAttribute('data-collection-root')) {
							highlightElement = parentElement;
						} else {
							highlightElement = parentElement.parentElement as HTMLElement;
						}
						break;
					}
					parentElement = parentElement.parentElement;
				}
			} else {
				highlightElement = collapsibleTriggerElement as HTMLElement;
			}
		} else {
			// Check for collection folder only if collapsible root is not present
			const collectionFolderElement = element.closest('[data-collection-root]');
			highlightElement = collectionFolderElement as HTMLElement;
		}

		if (highlightElement) {
			// If any parent or ancestor of the current element has the attribute data-collapsible-root or data-collection-root
			if (previousHighlightedElement && previousHighlightedElement !== highlightElement) {
				// Reset the background color of the previously highlighted element
				previousHighlightedElement.removeAttribute('data-highlighted');
			}
			// Highlight the element by setting a custom attribute
			highlightElement.setAttribute('data-highlighted', 'true');
			// Update the previousHighlightedElement variable
			previousHighlightedElement = highlightElement;
		} else {
			// If no element with the attribute data-collapsible-root or data-collection-root is found, reset the background color & previousHighlightedElement
			if (previousHighlightedElement) {
				previousHighlightedElement.removeAttribute('data-highlighted');
				previousHighlightedElement = null;
			}
		}
	}

	// Function to handle drag end
	function handleDragEnd(event: DragEvent, path: string, isFolder: boolean = false) {
		if (dragPreviewItem) {
			// Remove the custom element
			document.body.removeChild(dragPreviewItem);
			dragPreviewItem = null;
		}

		// Reset the dragItem
		dragItem = null;

		// Reset the opacity of the original element
		(event.currentTarget as HTMLElement).style.opacity = '';

		if (previousHighlightedElement) {
			// Check if the note is not being dropped in the same folder it's currently in
			const isSameFolder =
				previousHighlightedElement.getAttribute('data-path') ===
					path.split('/').slice(0, -1).join('/') ||
				previousHighlightedElement.firstElementChild?.getAttribute('data-path') ===
					path.split('/').slice(0, -1).join('/');

			if (!isSameFolder) {
				// Move the note to the folder
				if (previousHighlightedElement.hasAttribute('data-collection-root')) {
					if (isFolder) {
						moveFolder(path, previousHighlightedElement.getAttribute('data-path')!);
					} else {
						moveNote(path, previousHighlightedElement.getAttribute('data-path')!);
					}
				} else if (previousHighlightedElement.firstElementChild?.getAttribute('data-path')) {
					if (isFolder) {
						moveFolder(
							path,
							previousHighlightedElement.firstElementChild.getAttribute('data-path')!
						);
					} else {
						moveNote(path, previousHighlightedElement.firstElementChild.getAttribute('data-path')!);
					}
				}
			}

			// Reset background color & previousHighlightedElement
			previousHighlightedElement.removeAttribute('data-highlighted');
			previousHighlightedElement = null;
		}

		// Remove dragover event listener from document
		document.removeEventListener('dragover', handleDragOver);
	}

	return { handleDragStart, handleDragEnd };
}
