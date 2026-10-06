import { z } from "zod";

import { hexColorSchema, pickForegroundColor, toCssRgb } from "#/lib/colors";

/** Data needed to render one member's pass, as stored in the database. */
export const applePassInputSchema = z.object({
	program: z.object({
		name: z.string().trim().min(1).max(64),
		backgroundColor: hexColorSchema,
		message: z.string().trim().min(1).max(100).nullable(),
	}),
	member: z.object({
		name: z.string().trim().min(1).max(128),
		points: z.int().nonnegative(),
	}),
	pass: z.object({
		serialNumber: z.string().min(16).max(64),
		// Apple requires at least 16 characters.
		authenticationToken: z.string().min(16).max(128),
	}),
});

export type ApplePassInput = z.input<typeof applePassInputSchema>;

/** Deployment-level values shared by every pass. */
export interface ApplePassOptions {
	teamId: string;
	passTypeId: string;
	/** Base URL of the PassKit Web Service, without trailing slash. */
	webServiceUrl: string;
}

const passFieldSchema = z.object({
	key: z.string().min(1),
	label: z.string().optional(),
	value: z.union([z.string(), z.number()]),
	changeMessage: z.string().includes("%@").optional(),
});

/** The subset of Apple's `pass.json` format used by Loylo store cards. */
export const applePassJsonSchema = z.object({
	formatVersion: z.literal(1),
	passTypeIdentifier: z.string().startsWith("pass."),
	teamIdentifier: z.string().min(1),
	serialNumber: z.string().min(1),
	authenticationToken: z.string().min(16),
	webServiceURL: z.url(),
	organizationName: z.string().min(1),
	description: z.string().min(1),
	logoText: z.string().min(1),
	backgroundColor: z.string().startsWith("rgb("),
	foregroundColor: z.string().startsWith("rgb("),
	labelColor: z.string().startsWith("rgb("),
	sharingProhibited: z.boolean(),
	barcodes: z
		.array(
			z.object({
				format: z.literal("PKBarcodeFormatQR"),
				message: z.string().min(1),
				messageEncoding: z.literal("iso-8859-1"),
			}),
		)
		.min(1),
	storeCard: z.object({
		primaryFields: z.array(passFieldSchema),
		secondaryFields: z.array(passFieldSchema),
		backFields: z.array(passFieldSchema),
	}),
});

export type ApplePassJson = z.infer<typeof applePassJsonSchema>;

/** Builds the `pass.json` of a member's store card. Pure: same input, same output. */
export function buildApplePassJson(
	input: ApplePassInput,
	options: ApplePassOptions,
): ApplePassJson {
	const { program, member, pass } = applePassInputSchema.parse(input);
	const foreground = toCssRgb(pickForegroundColor(program.backgroundColor));

	return {
		formatVersion: 1,
		passTypeIdentifier: options.passTypeId,
		teamIdentifier: options.teamId,
		serialNumber: pass.serialNumber,
		authenticationToken: pass.authenticationToken,
		webServiceURL: options.webServiceUrl,
		organizationName: program.name,
		description: `${program.name} loyalty card`,
		logoText: program.name,
		backgroundColor: toCssRgb(program.backgroundColor),
		foregroundColor: foreground,
		labelColor: foreground,
		sharingProhibited: true,
		barcodes: [
			{
				format: "PKBarcodeFormatQR",
				message: pass.serialNumber,
				messageEncoding: "iso-8859-1",
			},
		],
		storeCard: {
			primaryFields: [
				{
					key: "points",
					label: "POINTS",
					value: member.points,
					changeMessage: "You now have %@ points.",
				},
			],
			secondaryFields: [{ key: "member", label: "MEMBER", value: member.name }],
			backFields: [
				{
					// Marketing notifications update this field; `changeMessage`
					// makes Wallet show the new value as a notification.
					key: "message",
					label: "Message",
					value: program.message ?? `Welcome to ${program.name}!`,
					changeMessage: "%@",
				},
			],
		},
	};
}
