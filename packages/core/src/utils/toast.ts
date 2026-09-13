// Thin wrapper around svelte-sonner so API modules can surface user
// feedback without statically importing the component library. The lazy
// import keeps non-DOM contexts (SSR, unit tests) silent and cheap.
type Sonner = typeof import('svelte-sonner').toast;

let pending: Promise<Sonner | null> | undefined;

const load = (): Promise<Sonner | null> => {
	if (typeof document === 'undefined') return Promise.resolve(null);
	pending ??= import('svelte-sonner').then((m) => m.toast).catch(() => null);
	return pending;
};

export const toast = {
	success: (message: string) => {
		void load().then((t) => t?.success(message));
	},
	info: (message: string) => {
		void load().then((t) => t?.info(message));
	},
	error: (message: string, error?: unknown) => {
		const description = error instanceof Error && error.message ? error.message : undefined;
		void load().then((t) => t?.error(message, description ? { description } : undefined));
	}
};
