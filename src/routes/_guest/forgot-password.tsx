import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { requestPasswordReset } from "#/features/auth/auth.functions";
import { forgotPasswordSchema } from "#/features/auth/auth.schemas";
import { AuthCard } from "#/features/auth/components/auth-card";
import { useSchemaForm } from "#/lib/forms";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";

export const Route = createFileRoute("/_guest/forgot-password")({
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const requestPasswordResetFn = useServerFn(requestPasswordReset);
	const [sentTo, setSentTo] = useState<string | null>(null);
	const form = useSchemaForm(forgotPasswordSchema, async (data) => {
		await requestPasswordResetFn({ data });
		setSentTo(data.email);
	});

	return (
		<AuthCard
			title="Reset your password"
			description="We will email you a link to choose a new password."
			footer={<Link to="/login">Back to sign in</Link>}
		>
			<form onSubmit={form.onSubmit} noValidate>
				<FieldGroup>
					<FormAlert>{form.formError}</FormAlert>
					<FormAlert tone="success">
						{sentTo
							? `If an account exists for ${sentTo}, a reset link is on its way.`
							: null}
					</FormAlert>
					<FormField
						name="email"
						label="Email"
						type="email"
						autoComplete="email"
						error={form.fieldErrors.email}
					/>
					<Button type="submit" disabled={form.pending}>
						{form.pending ? "Sending…" : "Send reset link"}
					</Button>
				</FieldGroup>
			</form>
		</AuthCard>
	);
}
