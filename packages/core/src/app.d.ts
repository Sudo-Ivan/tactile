// Ambient declarations for the SvelteKit virtual modules used by shared
// components. Both consuming apps are SvelteKit projects and resolve the
// real, typed modules at build time; these declarations only exist so
// svelte-check inside this package can type-check the sources.

declare module '$app/navigation' {
	export function goto(
		url: string | URL,
		opts?: {
			replaceState?: boolean;
			noScroll?: boolean;
			keepFocus?: boolean;
			invalidateAll?: boolean;
			state?: Record<string, unknown>;
		}
	): Promise<void>;
	export function invalidateAll(): Promise<void>;
}

declare module '$app/paths' {
	export function resolve(path: string, params?: Record<string, string>): string;
}

declare module '$app/state' {
	export const page: {
		url: URL;
		params: Record<string, string>;
		route: { id: string | null };
		[key: string]: unknown;
	};
}
