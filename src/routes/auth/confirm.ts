import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { redirectPathSchema } from "#/features/auth/auth.schemas";
import { createAuthClient } from "#/features/auth/auth.server";

/**
 * Target of the links in auth emails (see supabase/templates). Verifies the
 * one-time token, which sets the session cookies, then opens `next`.
 */

const confirmQuerySchema = z.object({
	token_hash: z.string().min(1),
	type: z.enum([
		"email",
		"signup",
		"recovery",
		"invite",
		"magiclink",
		"email_change",
	]),
	next: redirectPathSchema.catch("/dashboard"),
});

function redirectTo(path: string): Response {
	return new Response(null, { status: 303, headers: { Location: path } });
}

export const Route = createFileRoute("/auth/confirm")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const query = confirmQuerySchema.safeParse(
					Object.fromEntries(new URL(request.url).searchParams),
				);
				if (query.success) {
					const { token_hash, type, next } = query.data;
					const { error } = await createAuthClient().auth.verifyOtp({
						token_hash,
						type,
					});
					if (!error) {
						return redirectTo(next);
					}
				}
				return redirectTo("/login?error=invalid-link");
			},
		},
	},
});
