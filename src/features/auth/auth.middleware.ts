import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";

import { createUserClient } from "#/lib/supabase/user-client.server";

/**
 * Requires a signed-in user for a server function. This is the security
 * boundary: route guards only decide what the browser shows.
 *
 * `getClaims()` verifies the session token's signature (unlike `getSession()`,
 * which trusts the cookie as is).
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(
	async ({ next }) => {
		const supabase = createUserClient();
		const { data } = await supabase.auth.getClaims();
		if (!data) {
			throw redirect({ to: "/login" });
		}
		return next({ context: { supabase, userId: data.claims.sub } });
	},
);
