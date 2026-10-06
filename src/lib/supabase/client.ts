/// <reference types="vite/client" />
import { createBrowserClient } from "@supabase/ssr";
import { z } from "zod";

import type { Database } from "#/lib/supabase/database.types";

const browserEnvSchema = z.object({
	VITE_SUPABASE_URL: z.url(),
	VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

/**
 * Supabase client for the browser. Data access goes through server functions;
 * keep this for browser-only features.
 */
export function createClient() {
	const env = browserEnvSchema.parse(import.meta.env);
	return createBrowserClient<Database>(
		env.VITE_SUPABASE_URL,
		env.VITE_SUPABASE_PUBLISHABLE_KEY,
	);
}
