import type { CookieMethodsServer } from "@supabase/ssr";
import {
	getCookies,
	getRequest,
	setCookie,
	setResponseHeader,
} from "@tanstack/react-start/server";

/**
 * Session cookies for `@supabase/ssr`. The session is only handled on the
 * server, so cookies are `HttpOnly` (out of reach of scripts) and `Secure`
 * whenever the app is served over HTTPS.
 */
export function sessionCookies(): CookieMethodsServer {
	const secure = new URL(getRequest().url).protocol === "https:";

	return {
		getAll() {
			return Object.entries(getCookies()).map(([name, value]) => ({
				name,
				value,
			}));
		},
		setAll(cookies, headers) {
			for (const { name, value, options } of cookies) {
				setCookie(name, value, { ...options, httpOnly: true, secure });
			}
			for (const [name, value] of Object.entries(headers)) {
				setResponseHeader(name, value);
			}
		},
	};
}
