import { createClient } from "@supabase/supabase-js";

import { getSupabaseAdminConfig } from "#/lib/config.server";
import type { Database } from "#/lib/supabase/database.types";

/**
 * Supabase client with the secret key: it bypasses Row Level Security.
 *
 * Only for requests that have no signed-in user and validate their input
 * themselves (public enrollment, Apple and Google Wallet callbacks).
 */
export function createAdminClient() {
	const { url, secretKey } = getSupabaseAdminConfig();

	return createClient<Database>(url, secretKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}
