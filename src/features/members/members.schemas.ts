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

export const memberIdSchema = z.object({ memberId: z.uuid() });

export const programMemberSchema = memberIdSchema.extend({
	programId: z.uuid(),
});

/** Text searched in members' names and emails. Empty means no search. */
export const memberSearchSchema = z
	.string()
	.trim()
	.max(100)
	.transform((search) => search || undefined);

/**
 * Position in the members list, newest first: the creation time and ID of
 * the last member shown, as `{createdAt}_{id}`.
 */
export const memberCursorSchema = z
	.string()
	.transform((cursor) => {
		const separator = cursor.lastIndexOf("_");
		return {
			createdAt: cursor.slice(0, separator),
			id: cursor.slice(separator + 1),
		};
	})
	.pipe(
		z.object({ createdAt: z.iso.datetime({ offset: true }), id: z.uuid() }),
	);

export function toMemberCursor(member: { createdAt: string; id: string }) {
	return `${member.createdAt}_${member.id}`;
}

export const memberListSchema = z.object({
	programId: z.uuid(),
	search: memberSearchSchema.optional(),
	after: memberCursorSchema.optional(),
});

/** Content of a pass's QR code. */
export const serialNumberSchema = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^[0-9a-f]{32}$/, "This is not a loyalty card code.");

export const passScanSchema = z.object({
	programId: z.uuid(),
	serialNumber: serialNumberSchema,
});

export const POINTS_DIRECTIONS = ["add", "redeem"] as const;

/** Points to add or redeem, as the member page's form sends them. */
export const pointsChangeFieldsSchema = z.object({
	points: z.coerce
		.number({ error: "Enter a number of points." })
		.int("Enter a whole number.")
		.min(1, "Enter at least 1 point.")
		.max(100_000, "Use at most 100,000 points at once."),
	direction: z.enum(POINTS_DIRECTIONS, { error: "Choose add or redeem." }),
});

export type PointsChangeFields = z.output<typeof pointsChangeFieldsSchema>;

export const pointsChangeSchema = pointsChangeFieldsSchema.extend({
	memberId: z.uuid(),
});

export const transactionListSchema = memberIdSchema.extend({
	/** Only transactions older than this one: the last one shown. */
	before: z.int().positive().optional(),
});
