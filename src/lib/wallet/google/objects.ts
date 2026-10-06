import { z } from "zod";

import { hexColorSchema } from "#/lib/colors";

/**
 * Builders for Google Wallet loyalty classes (one per program) and objects
 * (one per member pass). Pure: same input, same output.
 */

/** Suffix of a class or object ID: Google allows letters, digits, `.`, `_` and `-`. */
const idSuffixSchema = z
	.string()
	.min(1)
	.max(100)
	.regex(/^[\w.-]+$/, "Expected letters, digits, '.', '_' or '-'");

/** Google IDs are prefixed with the issuer ID. */
export function toGoogleWalletId(issuerId: string, suffix: string): string {
	return `${issuerId}.${idSuffixSchema.parse(suffix)}`;
}

export const loyaltyClassInputSchema = z.object({
	classSuffix: idSuffixSchema,
	programName: z.string().trim().min(1).max(64),
	backgroundColor: hexColorSchema,
	/** Public HTTPS URL: Google downloads the logo itself. */
	logoUrl: z.url({ protocol: /^https$/ }),
});

export type LoyaltyClassInput = z.input<typeof loyaltyClassInputSchema>;

export const loyaltyObjectInputSchema = z.object({
	classSuffix: idSuffixSchema,
	objectSuffix: idSuffixSchema,
	serialNumber: z.string().min(16).max(64),
	memberName: z.string().trim().min(1).max(128),
	points: z.int().nonnegative(),
});

export type LoyaltyObjectInput = z.input<typeof loyaltyObjectInputSchema>;

interface LocalizedString {
	defaultValue: { language: string; value: string };
}

export interface GoogleLoyaltyClass {
	id: string;
	issuerName: string;
	programName: string;
	programLogo: {
		sourceUri: { uri: string };
		contentDescription: LocalizedString;
	};
	hexBackgroundColor: string;
	reviewStatus: "UNDER_REVIEW";
	multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES";
	callbackOptions: { url: string };
}

export interface GoogleLoyaltyPoints {
	label: string;
	balance: { int: number };
}

export interface GoogleLoyaltyObject {
	id: string;
	classId: string;
	state: "ACTIVE";
	accountName: string;
	loyaltyPoints: GoogleLoyaltyPoints;
	barcode: { type: "QR_CODE"; value: string };
}

export function buildLoyaltyPoints(points: number): GoogleLoyaltyPoints {
	return {
		label: "Points",
		balance: { int: z.int().nonnegative().parse(points) },
	};
}

export function buildLoyaltyClass(
	input: LoyaltyClassInput,
	options: { issuerId: string; callbackUrl: string },
): GoogleLoyaltyClass {
	const { classSuffix, programName, backgroundColor, logoUrl } =
		loyaltyClassInputSchema.parse(input);

	return {
		id: toGoogleWalletId(options.issuerId, classSuffix),
		issuerName: programName,
		programName: "Loyalty card",
		programLogo: {
			sourceUri: { uri: logoUrl },
			contentDescription: {
				defaultValue: { language: "en-US", value: `${programName} logo` },
			},
		},
		hexBackgroundColor: backgroundColor,
		// Required on every insert and update; Google reviews the class once.
		reviewStatus: "UNDER_REVIEW",
		// Same intent as `sharingProhibited` on Apple passes.
		multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES",
		// Google calls it when a pass is saved or deleted.
		callbackOptions: { url: options.callbackUrl },
	};
}

export function buildLoyaltyObject(
	input: LoyaltyObjectInput,
	options: { issuerId: string },
): GoogleLoyaltyObject {
	const { classSuffix, objectSuffix, serialNumber, memberName, points } =
		loyaltyObjectInputSchema.parse(input);

	return {
		id: toGoogleWalletId(options.issuerId, objectSuffix),
		classId: toGoogleWalletId(options.issuerId, classSuffix),
		state: "ACTIVE",
		accountName: memberName,
		loyaltyPoints: buildLoyaltyPoints(points),
		// Same QR code content as the Apple pass: the serial number.
		barcode: { type: "QR_CODE", value: serialNumber },
	};
}
