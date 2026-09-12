import { platform } from '@tauri-apps/plugin-os';

// Resolved once at module init. platform() is synchronous inside tauri and
// throws in non-tauri web contexts, which is fine since this app only ever
// runs inside tauri.
const currentPlatform = platform();

export const isMobile = currentPlatform === 'android' || currentPlatform === 'ios';
