import { createServerClient } from "@supabase/ssr";
import { type AuthError, createClient } from "@supabase/supabase-js";

import { getSupabaseAdminConfig } from "#/lib/config.server";
import { consumeRateLimit, getClientIp } from "#/lib/rate-limit.server";
import { sessionCookies } from "#/lib/supabase/cookies.server";
import type { Database } from "#/lib/supabase/database.types";

/**
 * Client for Supabase Auth endpoints only (sign in, sign up, OTP, password
 * reset). Supabase rate-limits them per IP and every call comes from the
 * Worker, so the visitor's IP is forwarded with `Sb-Forwarded-For`, which
 * requires the secret key. Never use this client to read or write data.
 */
export function createAuthClient() {
	const { url, secretKey } = getSupabaseAdminConfig();
	const ip = getClientIp();

	return createServerClient<Database>(url, secretKey, {
		cookies: sessionCookies(),
		global: { headers: ip ? { "sb-forwarded-for": ip } : {} },
	});
}

export type AuthAction =
	| "sign-in"
	| "sign-up"
	| "password-reset"
	| "email-change"
	| "reauthenticate";

/** Slows down credential stuffing: a few attempts per minute and per IP. */
export async function enforceAuthRateLimit(action: AuthAction): Promise<void> {
	if (!(await consumeRateLimit("AUTH_RATE_LIMITER", action))) {
		throw new Error("Too many attempts. Wait a minute and try again.");
	}
}

/**
 * Checks a signed-in user's password before a sensitive change. Signs in on
 * a throwaway client and ends that session right away, so the session
 * cookies are left alone. Callers rate-limit it (`reauthenticate`).
 */
export async function verifyPassword(
	email: string,
	password: string,
): Promise<boolean> {
	const { url, secretKey } = getSupabaseAdminConfig();
	const ip = getClientIp();
	const client = createClient<Database>(url, secretKey, {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { headers: ip ? { "sb-forwarded-for": ip } : {} },
	});

	const { error } = await client.auth.signInWithPassword({ email, password });
	if (error) {
		if (error.code === "invalid_credentials") {
			return false;
		}
		throw new Error(toAuthErrorMessage(error));
	}
	await client.auth.signOut({ scope: "local" });
	return true;
}

/** Turns a Supabase Auth error into a message that is safe to show. */
export function toAuthErrorMessage(error: AuthError): string {
	switch (error.code) {
		case "invalid_credentials":
			return "Invalid email or password.";
		case "email_not_confirmed":
			return "Confirm your email address first: check your inbox.";
		case "weak_password":
			return "This password is too weak. Choose a longer or less common one.";
		case "same_password":
			return "Choose a password different from your current one.";
		case "over_request_rate_limit":
		case "over_email_send_rate_limit":
			return "Too many attempts. Wait a minute and try again.";
		default:
			console.error("Supabase Auth error", error.code, error.message);
			return "Something went wrong. Try again in a moment.";
	}
}
