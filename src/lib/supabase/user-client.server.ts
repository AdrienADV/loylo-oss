import { createServerClient } from "@supabase/ssr";

import { getSupabaseConfig } from "#/lib/config.server";
import { sessionCookies } from "#/lib/supabase/cookies.server";
import type { Database } from "#/lib/supabase/database.types";

/**
 * Supabase client acting as the signed-in user (session cookies), so Row
 * Level Security applies. The default client for server functions.
 */
export function createUserClient() {
	const { url, publishableKey } = getSupabaseConfig();

	return createServerClient<Database>(url, publishableKey, {
		cookies: sessionCookies(),
	});
}
