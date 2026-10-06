import { z } from "zod";

import { hexColorSchema } from "#/lib/colors";

/** Editable fields of a program, shared by the form and the server functions. */
export const programFieldsSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, "Enter the name of your business.")
		.max(64, "Use at most 64 characters."),
	backgroundColor: hexColorSchema,
	initialPoints: z.coerce
		.number({ error: "Enter a number." })
		.int("Enter a whole number.")
		.min(0, "Points cannot be negative.")
		.max(1_000_000, "Use at most 1,000,000 points."),
});

export type ProgramFields = z.output<typeof programFieldsSchema>;

export const programIdSchema = z.object({ programId: z.uuid() });

/**
 * Images generated in the browser from the uploaded logo, stored in the
 * `program-assets` bucket. Apple Wallet uses the icon (notifications, lock
 * screen) and the logo (top of the pass); Google Wallet shows a square logo
 * in a circle and recommends 660×660 px.
 */
export const PROGRAM_IMAGES = {
	"apple-icon.png": { width: 29, height: 29, fit: "square" },
	"apple-icon@2x.png": { width: 58, height: 58, fit: "square" },
	"apple-logo.png": { width: 160, height: 50, fit: "within" },
	"apple-logo@2x.png": { width: 320, height: 100, fit: "within" },
	"google-logo.png": { width: 660, height: 660, fit: "square" },
} as const;

export type ProgramImageName = keyof typeof PROGRAM_IMAGES;

export const PROGRAM_IMAGE_NAMES = Object.keys(
	PROGRAM_IMAGES,
) as ProgramImageName[];

/** The `program-assets` bucket only accepts PNG files up to 1 MB. */
export const MAX_PROGRAM_IMAGE_BYTES = 1024 * 1024;
