import { z } from "zod";

export const emailSchema = z
	.string()
	.trim()
	.toLowerCase()
	.pipe(z.email("Enter a valid email address."));

// Supabase hashes passwords with bcrypt, which ignores bytes after the 72nd.
export const newPasswordSchema = z
	.string()
	.min(8, "Use at least 8 characters.")
	.max(72, "Use at most 72 characters.");

export const signInSchema = z.object({
	email: emailSchema,
	password: z.string().min(1, "Enter your password."),
});

export const signUpSchema = z.object({
	email: emailSchema,
	password: newPasswordSchema,
});

export const forgotPasswordSchema = z.object({
	email: emailSchema,
});

export const resetPasswordSchema = z
	.object({
		password: newPasswordSchema,
		confirmPassword: z.string(),
	})
	.refine((values) => values.password === values.confirmPassword, {
		message: "Passwords do not match.",
		path: ["confirmPassword"],
	});

/** In-app path to go to after signing in. Rejects other origins (`//evil.example`). */
export const redirectPathSchema = z.string().regex(/^\/(?![/\\])/);
