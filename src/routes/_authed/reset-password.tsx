import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { updatePassword } from "#/features/auth/auth.functions";
import { resetPasswordSchema } from "#/features/auth/auth.schemas";
import { AuthCard } from "#/features/auth/components/auth-card";
import { useSchemaForm } from "#/lib/forms";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";

/** Reached from the password reset email, which signs the user in. */
export const Route = createFileRoute("/_authed/reset-password")({
	component: ResetPasswordPage,
});

function ResetPasswordPage() {
	const navigate = useNavigate();
	const updatePasswordFn = useServerFn(updatePassword);
	const form = useSchemaForm(resetPasswordSchema, async ({ password }) => {
		await updatePasswordFn({ data: { password } });
		await navigate({ to: "/dashboard" });
	});

	return (
		<div className="flex justify-center">
			<AuthCard
				title="Choose a new password"
				description="You will stay signed in on this device."
			>
				<form onSubmit={form.onSubmit} noValidate>
					<FieldGroup>
						<FormAlert>{form.formError}</FormAlert>
						<FormField
							name="password"
							label="New password"
							type="password"
							autoComplete="new-password"
							error={form.fieldErrors.password}
						/>
						<FormField
							name="confirmPassword"
							label="Confirm the new password"
							type="password"
							autoComplete="new-password"
							error={form.fieldErrors.confirmPassword}
						/>
						<Button type="submit" disabled={form.pending}>
							{form.pending ? "Saving…" : "Save the new password"}
						</Button>
					</FieldGroup>
				</form>
			</AuthCard>
		</div>
	);
}
