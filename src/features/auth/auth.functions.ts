import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "#/features/auth/auth.middleware";
import {
	forgotPasswordSchema,
	newPasswordSchema,
	signInSchema,
	signUpSchema,
} from "#/features/auth/auth.schemas";
import {
	createAuthClient,
	enforceAuthRateLimit,
	toAuthErrorMessage,
} from "#/features/auth/auth.server";
import { createUserClient } from "#/lib/supabase/user-client.server";

/** The signed-in user, or `null`. Used by route guards. */
export const getCurrentUser = createServerFn({ method: "GET" }).handler(
	async () => {
		const { data } = await createUserClient().auth.getClaims();
		if (!data) {
			return null;
		}
		return { id: data.claims.sub, email: data.claims.email ?? "" };
	},
);

export const signUp = createServerFn({ method: "POST" })
	.validator(signUpSchema)
	.handler(async ({ data }) => {
		await enforceAuthRateLimit("sign-up");
		// An already registered email gets the same answer as a new one: the
		// response never reveals which addresses have an account.
		const { data: result, error } = await createAuthClient().auth.signUp(data);
		if (error) {
			throw new Error(toAuthErrorMessage(error));
		}
		return { needsEmailConfirmation: result.session === null };
	});

export const signIn = createServerFn({ method: "POST" })
	.validator(signInSchema)
	.handler(async ({ data }) => {
		await enforceAuthRateLimit("sign-in");
		const { error } = await createAuthClient().auth.signInWithPassword(data);
		if (error) {
			throw new Error(toAuthErrorMessage(error));
		}
	});

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
	// `local` ends this browser's session only, not the user's other devices.
	await createUserClient().auth.signOut({ scope: "local" });
});

export const requestPasswordReset = createServerFn({ method: "POST" })
	.validator(forgotPasswordSchema)
	.handler(async ({ data }) => {
		await enforceAuthRateLimit("password-reset");
		const { error } = await createAuthClient().auth.resetPasswordForEmail(
			data.email,
		);
		// Same answer whether or not the email has an account.
		if (error) {
			console.error("Password reset request failed", error.code, error.message);
		}
	});

export const updatePassword = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ password: newPasswordSchema }))
	.handler(async ({ data, context }) => {
		const { error } = await context.supabase.auth.updateUser({
			password: data.password,
		});
		if (error) {
			throw new Error(toAuthErrorMessage(error));
		}
	});
