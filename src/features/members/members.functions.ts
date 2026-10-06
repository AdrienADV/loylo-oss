import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { authMiddleware } from "#/features/auth/auth.middleware";
import { programMemberPassSchema } from "#/features/members/members.schemas";
import {
	getAvailableWallets,
	passLinkPath,
} from "#/features/members/wallet-passes.server";
import { databaseError } from "#/lib/supabase/errors.server";

/** Wallets the merchant can issue passes for. */
export const listAvailableWallets = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(() => getAvailableWallets());

/**
 * Issues a pass for a customer, from the merchant's side. A customer already
 * enrolled with this email gets a new pass that keeps their points (new phone,
 * other wallet). RLS limits it to the merchant's programs.
 */
export const issuePass = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(programMemberPassSchema)
	.handler(async ({ data, context }) => {
		if (!getAvailableWallets()[data.provider]) {
			throw new Error("This wallet is not available.");
		}

		const { data: pass, error } = await context.supabase
			.rpc("issue_wallet_pass", {
				program_id: data.programId,
				email: data.email,
				first_name: data.firstName,
				last_name: data.lastName,
				provider: data.provider,
			})
			.maybeSingle();
		if (error) {
			throw databaseError("issue the card", error);
		}
		if (!pass) {
			throw notFound();
		}

		return {
			passLink: passLinkPath({
				provider: data.provider,
				serialNumber: pass.serial_number,
				authenticationToken: pass.authentication_token,
			}),
			memberCreated: pass.member_created,
		};
	});
