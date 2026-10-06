import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { signUp } from "#/features/auth/auth.functions";
import { signUpSchema } from "#/features/auth/auth.schemas";
import { AuthCard } from "#/features/auth/components/auth-card";
import { useSchemaForm } from "#/lib/forms";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";

export const Route = createFileRoute("/_guest/signup")({
	component: SignUpPage,
});

function SignUpPage() {
	const navigate = useNavigate();
	const signUpFn = useServerFn(signUp);
	const [sentTo, setSentTo] = useState<string | null>(null);
	const form = useSchemaForm(signUpSchema, async (data) => {
		const { needsEmailConfirmation } = await signUpFn({ data });
		if (needsEmailConfirmation) {
			setSentTo(data.email);
		} else {
			await navigate({ to: "/dashboard" });
		}
	});

	if (sentTo) {
		return (
			<AuthCard
				title="Check your inbox"
				description={`We sent a confirmation link to ${sentTo}.`}
				footer={<Link to="/login">Back to sign in</Link>}
			>
				<p className="text-sm">
					Open the link to confirm your email address, then start creating
					loyalty cards.
				</p>
			</AuthCard>
		);
	}

	return (
		<AuthCard
			title="Create your account"
			description="Digital loyalty cards for Apple and Google Wallet."
			footer={
				<p>
					Already have an account? <Link to="/login">Sign in</Link>
				</p>
			}
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
					<FormField
						name="password"
						label="Password"
						type="password"
						autoComplete="new-password"
						error={form.fieldErrors.password}
					/>
					<Button type="submit" disabled={form.pending}>
						{form.pending ? "Creating your account…" : "Create account"}
					</Button>
				</FieldGroup>
			</form>
		</AuthCard>
	);
}
