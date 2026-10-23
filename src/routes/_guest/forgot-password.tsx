import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { requestPasswordReset } from "#/features/auth/auth.functions";
import { forgotPasswordSchema } from "#/features/auth/auth.schemas";
import { AuthCard } from "#/features/auth/components/auth-card";
import { useSchemaForm } from "#/lib/forms";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";

export const Route = createFileRoute("/_guest/forgot-password")({
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	const requestPasswordResetFn = useServerFn(requestPasswordReset);
	const form = useSchemaForm(forgotPasswordSchema, async (data) => {
		await requestPasswordResetFn({ data });
		toast.add({
			type: "success",
			title: "Check your inbox.",
			description: `If an account exists for ${data.email}, a reset link is on its way.`,
		});
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
