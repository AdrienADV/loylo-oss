import { z } from "zod";

import { emailSchema } from "#/features/auth/auth.schemas";

export const WALLET_PROVIDERS = ["apple", "google"] as const;

export const walletProviderSchema = z.enum(WALLET_PROVIDERS, {
	error: "Choose a wallet.",
});

export type WalletProvider = z.output<typeof walletProviderSchema>;

/** Names are free-form: any script, any capitalization, no minimum beyond one character. */
function nameSchema(missingMessage: string) {
	return z
		.string()
		.trim()
		.min(1, missingMessage)
		.max(50, "Use at most 50 characters.");
}

/**
 * Who gets a pass, and in which wallet. Shared by the public enrollment form
 * and the merchant's manual issue form.
 */
export const memberPassFieldsSchema = z.object({
	firstName: nameSchema("Enter a first name."),
	lastName: nameSchema("Enter a last name."),
	email: emailSchema,
	provider: walletProviderSchema,
});

export type MemberPassFields = z.output<typeof memberPassFieldsSchema>;

export const programMemberPassSchema = memberPassFieldsSchema.extend({
	programId: z.uuid(),
});
