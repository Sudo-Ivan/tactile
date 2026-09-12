<script lang="ts">
	import { createFolder, deleteFolder, moveFolder, renameFolder } from '@/api/folders';
	import { createNote, deleteNote, duplicateNote, moveNote, openNote } from '@/api/notes';
	import Icon from '@/components/shared/icon.svelte';
	import Shortcut from '@/components/shared/shortcut.svelte';
	import { SHORTCUTS, TIMING } from '@/constants';
	import { appState } from '@/store.svelte';
	import type { FileEntry } from '@/types';
	import Button from '@tactile/ui/components/button/button.svelte';
	import * as Collapsible from '@tactile/ui/components/collapsible';
	import * as ContextMenu from '@tactile/ui/components/context-menu';
	import { cn } from '@tactile/ui/lib/utils';
	import type { Snippet } from 'svelte';
	import FolderContextMenu from './folder-context-menu.svelte';
	import NoteContextMenu from './note-context-menu.svelte';

	interface Props {
		entry: FileEntry;
		open?: boolean;
		directories: FileEntry[];
		children?: Snippet;
	}

	let { entry, open = $bindable(false), directories, children }: Props = $props();

	let isRenaming = $state(false);
	let dragItem: HTMLElement | null = null; // Reference to the original element being dragged
	let dragPreviewItem: HTMLElement | null = null; // Reference to the custom drag preview element
	let previousHighlightedElement: HTMLElement | null = null;

	// Root padding is 0.75rem
	// Each level of nesting adds 0.75rem
	// Subtract file path length from collection path length for relative path depth
	let depthPadding = $derived(
		`${(entry.path.split('/').length - (appState.collection ?? '').split('/').length) * 0.75}rem`
	);

	// Rename note
	// BUG: Currently shortcuts prevent from typing when ur on hover fix that
	async function handleRename(entry: FileEntry, type: 'note' | 'folder') {
		// Set the isRenaming variable to true
		isRenaming = true;

		if (type === 'note') {
			// Open the note
			await openNote(entry.path);

			// Blur the editor
			appState.editor.instance?.commands.blur();

			// Get the inline title input (#inline-title-input)
			const inlineTitleInput = document.getElementById('inline-title-input') as HTMLInputElement;

			// Focus the input and select all text
			window.setTimeout(() => {
				inlineTitleInput?.focus();
				inlineTitleInput?.select();
			}, TIMING.renameFocusDelay);

			// Add blur event listener to the input
			inlineTitleInput?.addEventListener('blur', async () => {
				// Set the isRenaming variable to false
				isRenaming = false;

				// Remove the blur event listener
				inlineTitleInput?.removeEventListener('blur', () => {});
			});
		} else {
			// Get the element with the same data-path attribute as the current entry
			const element = document.querySelector(`[data-path="${entry.path}"]`);

			// Get the span within the div > button > div
			const span = element?.querySelector('span');

			// Set the contenteditable attribute to true
			window.setTimeout(() => {
				span?.setAttribute('contenteditable', 'true');

				// Focus the span
				span?.focus();

				// Select all text
				document.execCommand('selectAll');
			}, TIMING.folderRenameDelay);

			// Add blur event listener to the span
			span?.addEventListener('blur', () => {
				// Set the contenteditable attribute to false
				span?.setAttribute('contenteditable', 'false');

				// Rename the folder
				if (isRenaming) {
					renameFolder(entry.path, span?.textContent || '');
				}

				// Set the isRenaming variable to false
				isRenaming = false;

				// Remove the blur event listener
				span?.removeEventListener('blur', () => {});
			});

			// Add keydown event listener to the span
			span?.addEventListener('keydown', (event) => {
				// Check if the key pressed is the Enter key
				if (event.key === 'Enter') {
					// Prevent the default action
					event.preventDefault();

					// Remove the focus from the span
					span?.blur();
				} else if (event.key === 'Escape') {
					// Prevent the default action
					event.preventDefault();

					// Set the contenteditable attribute to false
					span?.setAttribute('contenteditable', 'false');

					// Set the isRenaming variable to false
					isRenaming = false;

					// Reset the text content of the span
					span.textContent = entry.name ?? '';

					// Remove the blur event listener
					span?.removeEventListener('blur', () => {});
				} else if (event.key === 'Space') {
					// Prevent the default action
					event.preventDefault();
					event.stopPropagation();
				}
			});
		}
	}

	// Function to handle drag start
	function handleDragStart(event: DragEvent, filename: string) {
		// Specify the effect allowed for the drag
		event.dataTransfer!.effectAllowed = 'move';

		// Set dragItem to the original element being dragged
		dragItem = event.currentTarget as HTMLElement;

		// Create a custom drag preview element
		dragPreviewItem = document.createElement('div');
		dragPreviewItem.classList.add('drag-item');
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
</script>

{#if entry.children}
	<Collapsible.Root class="w-full" bind:open>
		<ContextMenu.Root>
			<ContextMenu.Trigger data-path={entry.path}>
				<div
					class="w-full h-full"
					role="button"
					ondragstart={(e) => handleDragStart(e, entry.name || '')}
					tabindex="0"
					ondragend={(e) => {
						handleDragEnd(e, entry.path, true);
					}}
					data-is-folder
				>
					<Collapsible.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								size="sm"
								variant="ghost"
								scale="sm"
								class="h-7 w-full fill-muted-foreground hover:fill-foreground text-secondary-foreground/80 hover:text-foreground transition-all flex items-center justify-between"
								style={`padding-left: ${depthPadding}`}
								draggable
							>
								<Shortcut
									options={SHORTCUTS['folder:create']}
									callback={() => {
										if (!isRenaming) createFolder(entry.path);
									}}
								/>
								<Shortcut
									options={SHORTCUTS['folder:rename']}
									callback={() => !isRenaming && handleRename(entry, 'folder')}
								/>
								<Shortcut
									options={SHORTCUTS['folder:create-note']}
									callback={() => !isRenaming && createNote(entry.path)}
								/>
								<Shortcut
									options={SHORTCUTS['folder:delete']}
									callback={() => !isRenaming && deleteFolder(entry.path)}
								/>
								<div class="flex items-center w-[calc(100%-20px)] gap-2">
									<Icon name="folder" class={cn('w-[18px] h-[18px] shrink-0', open && 'hidden')} />
									<Icon
										name="folderOpen"
										class={cn('w-[18px] h-[18px] shrink-0', !open && 'hidden')}
									/>
									<span class="text-xs truncate outline-none" spellcheck="false">{entry.name}</span>
								</div>
								<!-- TODO: Make this an optional feature -->
								<span class="text-xs text-foreground/40">{entry.children?.length}</span>
							</Button>
						{/snippet}
					</Collapsible.Trigger>
				</div>
			</ContextMenu.Trigger>
			<FolderContextMenu
				{entry}
				{directories}
				onExpand={() => (open = true)}
				onRename={() => handleRename(entry, 'folder')}
			/>
		</ContextMenu.Root>
		<Collapsible.Content class={cn('space-y-1.5 pt-1.5', entry.children.length === 0 && 'hidden')}>
			{@render children?.()}
		</Collapsible.Content>
	</Collapsible.Root>
{:else}
	<ContextMenu.Root>
		<ContextMenu.Trigger class="w-full" data-file-path={entry.path}>
			<div
				class="w-full h-full"
				role="button"
				ondragstart={(e) => handleDragStart(e, entry.name || '')}
				tabindex="0"
				ondragend={(e) => {
					handleDragEnd(e, entry.path);
				}}
			>
				<Button
					size="sm"
					variant="ghost"
					scale="sm"
					class={cn(
						'h-7 w-full transition-all text-secondary-foreground/80 hover:text-foreground flex items-center gap-2 justify-start',
						appState.activeFile === entry.path && 'bg-accent text-foreground'
					)}
					style={`padding-left: ${depthPadding}`}
					onclick={() => openNote(entry.path)}
					draggable
				>
					<Shortcut
						options={SHORTCUTS['note:rename']}
						callback={() => !isRenaming && handleRename(entry, 'note')}
					/>
					<Shortcut
						options={SHORTCUTS['note:duplicate']}
						callback={() => !isRenaming && duplicateNote(entry.path)}
					/>
					<Shortcut
						options={SHORTCUTS['note:delete']}
						callback={() => !isRenaming && deleteNote(entry.path)}
					/>
					<span class="text-xs truncate" spellcheck="false">{entry.name}</span>
				</Button>
			</div>
		</ContextMenu.Trigger>
		<NoteContextMenu {entry} {directories} onRename={() => handleRename(entry, 'note')} />
	</ContextMenu.Root>
{/if}

<style>
	:global(.drag-item) {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background-color: hsl(var(--secondary));
		border: 1px solid hsl(var(--border));
		padding-top: 5px;
		padding-bottom: 3px;
		padding-right: 10px;
		padding-left: 20px;
		font-size: 12px;
		width: fit-content;
		height: fit-content;
		border-radius: calc(var(--radius) - 2px);
		z-index: 100;
	}

	:global([data-highlighted]) {
		background-color: hsl(var(--accent));
	}

	:global([data-collapsible-root]) {
		border-radius: calc(var(--radius) - 2px);
	}
</style>
