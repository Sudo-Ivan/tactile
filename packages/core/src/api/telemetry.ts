import { DEFAULT_SENTRY_DSN } from '../constants';
import { appState } from '../state/app.svelte';

// Crash reporting via a Sentry-compatible endpoint (GlitchTip/Sentry).
// The DSN default ships with the app and can be overridden per build with
// PUBLIC_SENTRY_DSN. The whole thing is a no-op until the user-facing
// crash_reports setting is on, and dynamic import keeps the SDK out of the
// startup bundle when it is off.

let initialized = false;

export async function initTelemetry(dsn?: string): Promise<void> {
	if (initialized || typeof window === 'undefined') return;
	if (!appState.appSettings.crash_reports) return;
	initialized = true;
	try {
		const Sentry = await import('@sentry/svelte');
		Sentry.init({
			dsn: dsn || DEFAULT_SENTRY_DSN,
			sendDefaultPii: false,
			enableLogs: false
		});
	} catch {
		// Telemetry must never break the app.
	}
}
