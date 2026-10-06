import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { programMemberPassSchema } from "#/features/members/members.schemas";
import {
	getAvailableWallets,
	passLinkPath,
} from "#/features/members/wallet-passes.server";
import { programIdSchema } from "#/features/programs/programs.schemas";
import {
	PROGRAM_COLUMNS,
	toProgramView,
} from "#/features/programs/programs.server";
import { consumeRateLimit } from "#/lib/rate-limit.server";
import { createAdminClient } from "#/lib/supabase/admin-client.server";
import { databaseError, isUniqueViolation } from "#/lib/supabase/errors.server";

/**
 * Public enrollment (`/join/$programId`): no signed-in user, so these use the
 * admin client and only expose what the enrollment page shows.
 */

export const getPublicProgram = createServerFn({ method: "GET" })
	.validator(programIdSchema)
	.handler(async ({ data }) => {
		const supabase = createAdminClient();
		const { data: row, error } = await supabase
			.from("programs")
			.select(PROGRAM_COLUMNS)
			.eq("id", data.programId)
			.maybeSingle();
		if (error) {
			throw databaseError("load this loyalty program", error);
		}
		if (!row) {
			throw notFound();
		}

		const program = toProgramView(supabase, row);
		return {
			program: {
				id: program.id,
				name: program.name,
				backgroundColor: program.backgroundColor,
				initialPoints: program.initialPoints,
				logoUrl: program.logoUrl,
			},
			wallets: getAvailableWallets(),
		};
	});

/**
 * Creates the member and their first pass, then returns the pass link. An
 * email already enrolled is refused: anyone could type it, so handing out
 * that member's pass (and points) here would let them take it over. The
 * merchant can issue a new pass to an existing member instead.
 */
export const enroll = createServerFn({ method: "POST" })
	.validator(programMemberPassSchema)
	.handler(async ({ data }) => {
		if (!(await consumeRateLimit("ENROLLMENT_RATE_LIMITER", "enroll"))) {
			throw new Error("Too many attempts. Wait a minute and try again.");
		}
		if (!getAvailableWallets()[data.provider]) {
			throw new Error("This wallet is not available.");
		}

		const { data: pass, error } = await createAdminClient()
			.rpc("enroll_member", {
				program_id: data.programId,
				email: data.email,
				first_name: data.firstName,
				last_name: data.lastName,
				provider: data.provider,
			})
			.maybeSingle();
		if (error) {
			if (isUniqueViolation(error, "members_program_id_email_key")) {
				throw new Error(
					"This email already has a card for this program. Ask the staff to issue it again.",
				);
			}
			throw databaseError("create your card", error);
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
		};
	});
