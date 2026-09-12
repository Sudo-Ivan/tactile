import { WINDOW_THEME_EVENT } from '../constants';
import { emit } from '@tauri-apps/api/event';

export function hslToHex(hsl: string): string {
	// Extract the H, S, and L values from the HSL string
	const [h, sPercent, lPercent] = hsl
		.replace(/%/g, '') // Remove percentage signs
		.split(' ')
		.map(Number);

	const s = sPercent / 100;
	const l = lPercent / 100;

	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
		return Math.round(255 * color)
			.toString(16)
			.padStart(2, '0'); // Convert to hex and ensure two digits
	};

	return `#${f(0)}${f(8)}${f(4)}`;
}

export function updateWindowTheme() {
	// Get theme background color - (num num% num%)
	const hsl = getComputedStyle(document.documentElement).getPropertyValue('--background');

	// Convert to hex
	const hex = hslToHex(hsl);

	// Set window theme
	emit(WINDOW_THEME_EVENT, hex).catch((error) => {
		console.error('Failed to emit event:', error);
	});
}
