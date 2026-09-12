import { exportCollection, exportNote, exportSelection } from '../api/export';
import { createFolder } from '../api/folders';
import { fetchCollectionEntries } from '../api/collection';
import { createNote, deleteNote, duplicateNote, openNoteHistory, saveNote } from '../api/notes';
import type { IconKey } from '../components/shared/icon.svelte';
import { INLINE_TITLE_INPUT_ID, RENAME_INPUT_FOCUS_DELAY_MS, SHORTCUTS } from '../constants';
import { platform, platformHooks } from '../platform';
import { appState } from '../state/app.svelte';
import type { FileEntry, ShortcutParams } from '../types';
import { setEditorMode } from '../api/editor';

type Command = {
	title: string;
	icon: IconKey | null;
	shortcut?: ShortcutParams;
	onSelect?: () => string | void;
};

export type CommandGroup = {
	name: string;
	commands: Command[];
};

// Shared styling for command items in the menu pages
export const commandItemClass =
	'text-foreground/90 gap-3 [&>*]:text-foreground/90 [&>*]:aria-selected:text-foreground [&>*]:aria-selected:fill-foreground/50 [&>*]:aria-selected:fill-foreground';

// Flatten the collection entry tree into path/name pairs. isFolders=true
// yields directories, otherwise notes.
export const getAllItems = async (
	isFolders?: boolean,
	entries?: FileEntry[]
): Promise<{ path: string; name: string }[]> => {
	const items: { path: string; name: string }[] = [];

	if (!entries) {
		entries = await fetchCollectionEntries().catch(() => []);
	}

	entries.forEach(async (entry) => {
		if (isFolders) {
			if (entry.children !== undefined && !entry.name?.startsWith('.')) {
				const folderPath = entry.path;
				const folderName = entry.path.replace(appState.collection ?? '', '');
				items.push({ path: folderPath, name: folderName });
				const subItems = await getAllItems(isFolders, entry.children);
				items.push(...subItems);
			}
		} else {
			if (entry.children === undefined && !entry.name?.startsWith('.')) {
				const notePath = entry.path;
				const noteName = entry.path.replace(appState.collection ?? '', '');
				items.push({ path: notePath, name: noteName });
			} else {
				const subItems = await getAllItems(isFolders, entry.children);
				items.push(...subItems);
			}
		}
	});

	return items;
};

export const mainCommands: CommandGroup[] = [
	{
		name: 'Notes',
		commands: [
			{
				title: 'New note',
				icon: 'notePlus',
				shortcut: SHORTCUTS['notes:create'],
				onSelect: () => {
					createNote(appState.collection!);
				}
			},
			{
				title: 'New folder',
				icon: 'folderPlus',
				shortcut: SHORTCUTS['notes:create-folder'],
				onSelect: () => {
					createFolder(appState.collection!);
				}
			},
			{
				title: 'Open note',
				icon: 'note',
				shortcut: SHORTCUTS['command:open-note'],
				onSelect: () => {
					return 'open_note';
				}
			},
			{
				title: 'Search collection',
				icon: 'searchDocument',
				shortcut: SHORTCUTS['notes:search'],
				onSelect: () => {
					appState.collectionSearchActive = true;
				}
			},
			{
				title: 'Toggle editor mode',
				icon: 'cursorI',
				shortcut: SHORTCUTS['editor:toggle-mode'],
				onSelect: () => {
					setEditorMode(appState.editorMode === 'edit' ? 'view' : 'edit');
				}
			},
			{
				title: 'Toggle source mode',
				icon: 'cursorI',
				shortcut: SHORTCUTS['editor:source-mode'],
				onSelect: () => {
					setEditorMode(appState.editorMode === 'source' ? 'edit' : 'source');
				}
			},
			{
				title: 'Open trash',
				icon: 'bin',
				onSelect: () => {
					return 'trash';
				}
			},
			{
				title: 'Export collection (.zip)',
				icon: 'folderOpen',
				onSelect: () => {
					exportCollection();
				}
			},
			{
				title: 'Find in note',
				icon: 'searchDocument',
				shortcut: SHORTCUTS['editor:search'],
				onSelect: () => {
					appState.editorSearchActive = true;
				}
			}
		]
	},
	{
		name: 'Navigation',
		commands: [
			{
				title: 'Go to previous note',
				icon: 'arrowLeft',
				shortcut: SHORTCUTS['notes:history-back'],
				onSelect: () => {
					window.dispatchEvent(
						new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, metaKey: true })
					);
				}
			},
			{
				title: 'Go to next note',
				icon: 'arrowRight',
				shortcut: SHORTCUTS['notes:history-forward'],
				onSelect: () => {
					window.dispatchEvent(
						new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, metaKey: true })
					);
				}
			},
			{
				title: 'Open other collection',
				icon: 'folder',
				shortcut: SHORTCUTS['app:open-collection'],
				onSelect: () => {
					return 'open_collection';
				}
			},
			{
				title: 'Go to settings',
				icon: 'settings',
				shortcut: SHORTCUTS['app:settings'],
				onSelect: () => {
					appState.settingsStore.isOpen = true;
				}
			},
			{
				title: 'Go to help',
				icon: 'lifebouy',
				shortcut: SHORTCUTS['app:help'],
				onSelect: () => {
					return 'help_and_feedback';
				}
			},
			{
				title: 'View shortcuts',
				icon: 'bolt',
				shortcut: SHORTCUTS['app:shortcuts']
			},
			{
				title: 'Send feedback',
				icon: 'lifebouy',
				shortcut: SHORTCUTS['app:help'],
				onSelect: () => {
					return 'help_and_feedback';
				}
			},
			{
				title: 'Share with friends',
				icon: 'share',
				shortcut: SHORTCUTS['app:share'],
				onSelect: () => {
					return 'share';
				}
			}
		]
	},
	{
		name: 'Appearance',
		commands: [
			{
				title: 'Change theme',
				icon: 'sun',
				shortcut: SHORTCUTS['settings:toggle-theme'],
				onSelect: () => {
					return 'change_theme';
				}
			}
		]
	},
	{
		name: 'Layout',
		commands: [
			{
				title: 'Toggle sidebar',
				icon: 'sidebarMenuLeft',
				shortcut: SHORTCUTS['notes:toggle-sidebar'],
				onSelect: () => {
					appState.isPageSidebarOpen = !appState.isPageSidebarOpen;
				}
			},
			{
				title: 'Toggle note details',
				icon: 'sidebarMenuRight',
				shortcut: SHORTCUTS['notes:toggle-details'],
				onSelect: () => {
					appState.isNoteDetailSidebarOpen = !appState.isNoteDetailSidebarOpen;
				}
			}
		]
	}
];

export const createNoteCommands = (notePath: string): CommandGroup => {
	// "Reveal in Finder/Files/Explorer" only exists where the OS file
	// manager is reachable (desktop).
	const reveal = platformHooks()?.showInFolder
		? [
				{
					title: `Reveal in ${platform().fileManagerLabel?.() ?? 'file manager'}`,
					icon: 'eye' as IconKey,
					shortcut: SHORTCUTS['note:show-in-folder'],
					onSelect: () => {
						platform().showInFolder?.(notePath);
					}
				}
			]
		: [];

	// The printable export reads differently per platform (browser print
	// dialog vs saved HTML file).
	const print = platformHooks()?.printNote
		? [
				{
					title: platform().printNoteLabel ?? 'Export note as printable HTML',
					icon: 'share' as IconKey,
					onSelect: () => {
						platform().printNote?.(notePath);
					}
				}
			]
		: [];

	return {
		name: notePath.split('/').pop() as string,
		commands: [
			{
				title: 'Save note',
				icon: 'floppy',
				shortcut: SHORTCUTS['note:save'],
				onSelect: () => {
					saveNote(notePath);
				}
			},
			{
				title: 'Duplicate note',
				icon: 'copy',
				shortcut: SHORTCUTS['note:duplicate'],
				onSelect() {
					duplicateNote(notePath);
				}
			},
			{
				title: 'Rename note',
				icon: 'editPencil',
				shortcut: SHORTCUTS['note:rename'],
				onSelect: () => {
					// Blur the editor
					appState.editor.instance?.commands.blur();

					// Get the inline title input (#inline-title-input)
					const inlineTitleInput = document.getElementById(
						INLINE_TITLE_INPUT_ID
					) as HTMLInputElement;

					// Focus the input and select all text
					window.setTimeout(() => {
						inlineTitleInput?.focus();
						inlineTitleInput?.select();
					}, RENAME_INPUT_FOCUS_DELAY_MS);
				}
			},
			{
				title: 'Delete note',
				icon: 'bin',
				shortcut: SHORTCUTS['note:delete'],
				onSelect: () => {
					deleteNote(notePath);
				}
			},
			{
				title: 'Move note to...',
				icon: 'motionCirclesLines',
				shortcut: SHORTCUTS['command:move-note'],
				onSelect: () => {
					return 'move_note';
				}
			},
			{
				title: 'Copy note path',
				icon: 'copy',
				shortcut: SHORTCUTS['note:copy-path'],
				onSelect: () => {
					navigator.clipboard.writeText(notePath);
				}
			},
			...reveal,
			{
				title: 'Note history',
				icon: 'reload',
				onSelect: () => {
					openNoteHistory(notePath);
				}
			},
			{
				title: 'Export note (.md)',
				icon: 'note',
				onSelect: () => {
					exportNote(notePath);
				}
			},
			...print,
			{
				title: 'Export selection (.md)',
				icon: 'copy',
				onSelect: () => {
					exportSelection();
				}
			}
		]
	};
};
