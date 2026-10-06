import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { signIn } from "#/features/auth/auth.functions";
import { redirectPathSchema, signInSchema } from "#/features/auth/auth.schemas";
import { AuthCard } from "#/features/auth/components/auth-card";
import { useSchemaForm } from "#/lib/forms";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";

const searchSchema = z.object({
	redirect: redirectPathSchema.optional().catch(undefined),
	error: z.literal("invalid-link").optional().catch(undefined),
});

export const Route = createFileRoute("/_guest/login")({
	validateSearch: searchSchema,
	component: LoginPage,
});

function LoginPage() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const signInFn = useServerFn(signIn);
	const form = useSchemaForm(signInSchema, async (data) => {
		await signInFn({ data });
		await navigate({ href: search.redirect ?? "/dashboard" });
	});

	return (
		<AuthCard
			title="Sign in"
			description="Manage your loyalty programs."
			footer={
				<p>
					No account yet? <Link to="/signup">Create one</Link>
				</p>
			}
		>
			<form onSubmit={form.onSubmit} noValidate>
				<FieldGroup>
					{search.error === "invalid-link" ? (
						<FormAlert>
							This link is invalid or has expired. Sign in, or ask for a new
							link.
						</FormAlert>
					) : null}
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
						autoComplete="current-password"
						error={form.fieldErrors.password}
					/>
					<Button type="submit" disabled={form.pending}>
						{form.pending ? "Signing in…" : "Sign in"}
					</Button>
					<Link to="/forgot-password" className="text-muted-foreground text-sm">
						Forgot your password?
					</Link>
				</FieldGroup>
			</form>
		</AuthCard>
	);
}
