import { z } from "zod";

import { emailSchema, newPasswordSchema } from "#/features/auth/auth.schemas";

export const emailChangeSchema = z.object({ email: emailSchema });

const currentPasswordSchema = z.string().min(1, "Enter your current password.");

export const passwordChangeSchema = z.object({
	currentPassword: currentPasswordSchema,
	password: newPasswordSchema,
});

/** The form also asks for the new password twice. */
export const passwordChangeFormSchema = passwordChangeSchema
	.extend({ confirmPassword: z.string() })
	.refine((values) => values.password === values.confirmPassword, {
		message: "Passwords do not match.",
		path: ["confirmPassword"],
	});

export const accountDeletionSchema = z.object({
	password: currentPasswordSchema,
});
