import type { ThemeMode } from './types';
import { nextTheme } from './utils/theme';

// Platform capability hooks. The api modules and shared components in this
// package implement the common logic; genuinely platform-specific operations
// (native dialogs, OS trash, app-global settings storage, delivering exported
// files, mobile/chrome UI flags, theme control, external links) are injected
// by each app at startup via registerPlatform().

export interface PlatformHooks {
	// Present a native directory picker. Web has none; its callers always
	// pass a collection path explicitly.
	pickDirectory?: () => Promise<string | null>;

	// Move an entry to the operating system's trash. Absent on web: the
	// 'system' trash setting falls back to the collection's own .tactile/trash.
	moveToSystemTrash?: (path: string) => Promise<void>;

	// App-global settings persistence. Web uses localStorage, desktop a file
	// in the app data dir. Return null when nothing is stored yet.
	readAppSettings: () => Promise<string | null> | string | null;
	writeAppSettings: (json: string) => Promise<void> | void;

	// Known-collections index persistence (the list shown in "Open
	// collection"). Web keeps it inside the storage backend, desktop in the
	// app data dir. Return null when nothing is stored yet.
	readCollections: () => Promise<string | null>;
	writeCollections: (json: string) => Promise<void>;

	// Tactile identity persistence: the hex-encoded 32-byte Ed25519 seed
	// the app signs sync and publish requests with. Web uses localStorage,
	// desktop a file in the app data dir. Return null when no identity has
	// been generated yet; when the hooks are absent the identity is not
	// persisted.
	readIdentity?: () => Promise<string | null> | string | null;
	writeIdentity?: (seedHex: string) => Promise<void> | void;

	// Deliver an exported file to the user. Web triggers a browser download;
	// desktop asks for a location with a native save dialog.
	saveExport: (name: string, data: string | Uint8Array, mime: string) => void | Promise<void>;

	// True on mobile shells (Android/iOS tauri builds). Drives compact
	// layouts in shared components; absent/false on web.
	isMobile?: boolean;

	// Whether the app renders the fixed top header bar. Web always renders
	// it; on desktop only macOS shows it (traffic-light inset). Components
	// use this to offset fixed panels. Defaults to true when unregistered.
	hasHeader?: () => boolean;

	// Open a URL in the system browser (tauri shell plugin on desktop).
	// Falls back to window.open when absent.
	openExternal?: (url: string) => void;

	// Reveal a path in the OS file manager. Absent on web, where the
	// "Reveal in ..." command is not offered.
	showInFolder?: (path: string) => void | Promise<void>;

	// Name of the platform file manager ('Finder' on macOS) for the
	// "Reveal in ..." command label.
	fileManagerLabel?: () => string;

	// Theme control. Web drives mode-watcher; desktop writes
	// appState.appTheme (its root layout applies it through tauri setTheme).
	getThemeMode?: () => ThemeMode;
	setThemeMode?: (mode: ThemeMode) => void;

	// What the "printable note" command does and how it reads. Web opens
	// the browser print dialog (printNote); desktop exports a printable
	// HTML file (exportNoteHtml).
	printNote?: (path: string) => void | Promise<void>;
	printNoteLabel?: string;
}

let hooks: PlatformHooks | null = null;

export function registerPlatform(h: PlatformHooks): void {
	hooks = h;
}

// Internal accessor. Throws early so a missing registration is loud instead
// of surfacing as an undefined-call deep inside an api function.
export function platform(): PlatformHooks {
	if (!hooks) {
		throw new Error('@tactile/core: registerPlatform() must be called before using the api');
	}
	return hooks;
}

// Non-throwing accessor for optional UI capabilities. Safe to call during
// component render even when registerPlatform() has not run yet (tests).
export function platformHooks(): PlatformHooks | null {
	return hooks;
}

// True on mobile shells (Android/iOS). False everywhere else.
export function isMobile(): boolean {
	return hooks?.isMobile === true;
}

// Whether the fixed top header bar is rendered. Defaults to true so a
// missing registration behaves like the web app.
export function hasHeader(): boolean {
	return hooks?.hasHeader?.() ?? true;
}

// Open a URL externally; falls back to a new browser tab.
export function openExternal(url: string): void {
	if (hooks?.openExternal) {
		hooks.openExternal(url);
	} else {
		window.open(url, '_blank', 'noopener,noreferrer');
	}
}

// Current theme mode. 'system' follows the OS theme.
export function themeMode(): ThemeMode {
	return hooks?.getThemeMode?.() ?? 'system';
}

export function setThemeMode(mode: ThemeMode): void {
	hooks?.setThemeMode?.(mode);
}

// Cycle system -> light -> dark.
export function toggleTheme(): void {
	setThemeMode(nextTheme(themeMode()));
}
