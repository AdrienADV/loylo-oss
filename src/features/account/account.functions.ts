import { createServerFn } from "@tanstack/react-start";

import {
	accountDeletionSchema,
	emailChangeSchema,
	passwordChangeSchema,
} from "#/features/account/account.schemas";
import { authMiddleware } from "#/features/auth/auth.middleware";
import {
	enforceAuthRateLimit,
	toAuthErrorMessage,
	verifyPassword,
} from "#/features/auth/auth.server";
import { removeOwnerImages } from "#/features/programs/programs.server";
import { createAdminClient } from "#/lib/supabase/admin-client.server";
import type { createUserClient } from "#/lib/supabase/user-client.server";

/**
 * The merchant's own account. Sensitive changes ask for the current password
 * again: a session left open on a shared device is not enough.
 */

/** The signed-in user, read from Supabase Auth rather than the session token. */
async function getUser(supabase: ReturnType<typeof createUserClient>) {
	const { data, error } = await supabase.auth.getUser();
	if (error || !data.user.email) {
		throw new Error("Could not load your account. Sign in again.");
	}
	return { ...data.user, email: data.user.email };
}

async function requirePassword(
	supabase: ReturnType<typeof createUserClient>,
	password: string,
) {
	await enforceAuthRateLimit("reauthenticate");
	const user = await getUser(supabase);
	if (!(await verifyPassword(user.email, password))) {
		throw new Error("Your current password is wrong.");
	}
}

export const getAccount = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const user = await getUser(context.supabase);
		return { email: user.email, createdAt: user.created_at };
	});

/**
 * Starts an email change. Supabase sends a confirmation link to both the
 * current and the new address (secure email change), and the change happens
 * once both are opened. An address used by another account gets the same
 * answer: the response never reveals which addresses have an account.
 */
export const requestEmailChange = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(emailChangeSchema)
	.handler(async ({ data, context }) => {
		await enforceAuthRateLimit("email-change");
		const user = await getUser(context.supabase);
		if (user.email === data.email) {
			throw new Error("This is already your email.");
		}

		const { error } = await context.supabase.auth.updateUser({
			email: data.email,
		});
		if (error && error.code !== "email_exists") {
			throw new Error(toAuthErrorMessage(error));
		}
		return { currentEmail: user.email, newEmail: data.email };
	});

/**
 * Changes the password, then signs out the user's other devices: they may
 * have been signed in by whoever knew the old password. Their sessions end
 * now, but their access tokens stay valid until they expire (`jwt_expiry`):
 * `authMiddleware` verifies tokens without asking Supabase Auth.
 */
export const changePassword = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(passwordChangeSchema)
	.handler(async ({ data, context }) => {
		await requirePassword(context.supabase, data.currentPassword);

		const { error } = await context.supabase.auth.updateUser({
			password: data.password,
		});
		if (error) {
			throw new Error(toAuthErrorMessage(error));
		}
		const { error: signOutError } = await context.supabase.auth.signOut({
			scope: "others",
		});
		if (signOutError) {
			console.error("Could not sign out other devices", signOutError.message);
		}
	});

/**
 * Deletes the account and everything it owns: programs, members, passes,
 * points and messages follow by cascade. Cards already in wallets stop
 * updating; Google Wallet classes cannot be deleted and stay unused.
 */
export const deleteAccount = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(accountDeletionSchema)
	.handler(async ({ data, context }) => {
		await requirePassword(context.supabase, data.password);

		// Supabase cannot delete storage objects from SQL: images go first.
		try {
			await removeOwnerImages(context.supabase, context.userId);
		} catch (error) {
			console.error("Could not remove the account's images", error);
			throw new Error("Could not delete your account. Try again in a moment.");
		}

		// Deleting a user does not revoke their sessions: end them all first.
		await context.supabase.auth.signOut({ scope: "global" });
		// Users cannot delete themselves through the Data API: this needs the
		// secret key, once the password above confirmed who is asking.
		const { error } = await createAdminClient().auth.admin.deleteUser(
			context.userId,
		);
		if (error) {
			console.error("Could not delete the user", error.code, error.message);
			throw new Error(
				"Could not delete your account. Sign in again and retry.",
			);
		}
	});
