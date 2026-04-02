import { dev } from '$app/environment';
import type { Cookies, RequestEvent } from '@sveltejs/kit';

export const ANONYMOUS_SESSION_COOKIE = 'rivo-anon-session';

function generateAnonymousSessionId(): string {
	return crypto.randomUUID();
}

export function getAnonymousSessionId(event: RequestEvent): string | undefined {
	return event.cookies.get(ANONYMOUS_SESSION_COOKIE);
}

export function setAnonymousSessionCookie(cookies: Cookies, sessionId: string, url?: URL): void {
	const secure = dev ? url?.protocol === 'https:' : true;

	cookies.set(ANONYMOUS_SESSION_COOKIE, sessionId, {
		httpOnly: true,
		secure,
		sameSite: 'lax',
		expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
		path: '/'
	});
}

export function ensureAnonymousSession(event: RequestEvent): string {
	const existing = getAnonymousSessionId(event);
	if (existing) {
		return existing;
	}

	const sessionId = generateAnonymousSessionId();
	setAnonymousSessionCookie(event.cookies, sessionId, event.url);
	return sessionId;
}
