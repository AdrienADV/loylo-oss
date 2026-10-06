import { createServerClient } from "@supabase/ssr";
import {
	getCookies,
	setCookie,
	setResponseHeader,
} from "@tanstack/react-start/server";

import { getSupabaseConfig } from "#/lib/config.server";
import type { Database } from "#/lib/supabase/database.types";

/**
 * Supabase client acting as the signed-in user (session cookies), so Row
 * Level Security applies. The default client for server functions.
 */
export function createUserClient() {
	const { url, publishableKey } = getSupabaseConfig();

	return createServerClient<Database>(url, publishableKey, {
		cookies: {
			getAll() {
				return Object.entries(getCookies()).map(([name, value]) => ({
					name,
					value,
				}));
			},
			setAll(cookies, headers) {
				for (const { name, value, options } of cookies) {
					setCookie(name, value, options);
				}
				for (const [name, value] of Object.entries(headers)) {
					setResponseHeader(name, value);
				}
			},
		},
	});
}
