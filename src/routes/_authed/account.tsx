import {
	createFileRoute,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { z } from "zod";
import {
	changePassword,
	deleteAccount,
	getAccount,
	requestEmailChange,
} from "#/features/account/account.functions";
import {
	accountDeletionSchema,
	emailChangeSchema,
	passwordChangeFormSchema,
} from "#/features/account/account.schemas";
import { useSchemaForm } from "#/lib/forms";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { FormattedDate } from "@/components/formatted-date";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";

export const Route = createFileRoute("/_authed/account")({
	validateSearch: z.object({
		/** Set by the links of the email change emails. */
		emailChange: z.literal("confirmed").optional().catch(undefined),
	}),
	loader: () => getAccount(),
	head: () => ({ meta: [{ title: "Your account · Loylo" }] }),
	component: AccountPage,
});

function AccountPage() {
	const account = Route.useLoaderData();

	return (
		<div className="flex max-w-xl flex-col gap-10">
			<div className="flex flex-col gap-1">
				<h1 className="font-semibold text-2xl">Your account</h1>
				<p className="text-muted-foreground text-sm">
					Member since <FormattedDate value={account.createdAt} />
				</p>
			</div>
			<EmailSection email={account.email} />
			<PasswordSection />
			<DeleteAccountSection />
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col gap-4">
			<h2 className="font-semibold text-lg">{title}</h2>
			{children}
		</section>
	);
}

function EmailSection({ email }: { email: string }) {
	const { emailChange } = Route.useSearch();
	const requestEmailChangeFn = useServerFn(requestEmailChange);
	const formRef = useRef<HTMLFormElement>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const form = useSchemaForm(emailChangeSchema, async (data) => {
		setNotice(null);
		const { currentEmail, newEmail } = await requestEmailChangeFn({ data });
		formRef.current?.reset();
		setNotice(
			`We sent a confirmation link to ${currentEmail} and to ${newEmail}. Your email changes once both links are opened.`,
		);
	});

	return (
		<Section title="Email">
			<p className="text-sm">
				You sign in with <span className="font-medium">{email}</span>.
			</p>
			{emailChange === "confirmed" ? (
				<FormAlert tone="success">
					Link confirmed. If your email has not changed yet, also open the link
					sent to your other address.
				</FormAlert>
			) : null}
			<FormAlert tone="success">{notice}</FormAlert>
			<form ref={formRef} onSubmit={form.onSubmit} noValidate>
				<FieldGroup>
					<FormAlert>{form.formError}</FormAlert>
					<FormField
						name="email"
						label="New email"
						type="email"
						autoComplete="email"
						error={form.fieldErrors.email}
					/>
					<Button
						type="submit"
						variant="outline"
						className="self-start"
						disabled={form.pending}
					>
						{form.pending ? "Sending…" : "Change email"}
					</Button>
				</FieldGroup>
			</form>
		</Section>
	);
}

function PasswordSection() {
	const changePasswordFn = useServerFn(changePassword);
	const formRef = useRef<HTMLFormElement>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const form = useSchemaForm(
		passwordChangeFormSchema,
		async ({ currentPassword, password }) => {
			setNotice(null);
			await changePasswordFn({ data: { currentPassword, password } });
			formRef.current?.reset();
			setNotice(
				"Password changed. Your other devices will be signed out within the hour.",
			);
		},
	);

	return (
		<Section title="Password">
			<FormAlert tone="success">{notice}</FormAlert>
			<form ref={formRef} onSubmit={form.onSubmit} noValidate>
				<FieldGroup>
					<FormAlert>{form.formError}</FormAlert>
					<FormField
						name="currentPassword"
						label="Current password"
						type="password"
						autoComplete="current-password"
						error={form.fieldErrors.currentPassword}
					/>
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
					<Button
						type="submit"
						variant="outline"
						className="self-start"
						disabled={form.pending}
					>
						{form.pending ? "Saving…" : "Change password"}
					</Button>
				</FieldGroup>
			</form>
		</Section>
	);
}

function DeleteAccountSection() {
	const router = useRouter();
	const navigate = useNavigate();
	const deleteAccountFn = useServerFn(deleteAccount);
	const [confirming, setConfirming] = useState(false);
	const form = useSchemaForm(accountDeletionSchema, async (data) => {
		await deleteAccountFn({ data });
		await navigate({ to: "/", search: { account: "deleted" } });
		// The session is gone: drop the signed-in pages' cached data.
		router.clearCache();
	});

	return (
		<section className="flex flex-col gap-3 rounded-2xl border border-destructive/30 p-4">
			<h2 className="font-semibold">Delete your account</h2>
			<p className="text-muted-foreground text-sm">
				Deletes your loyalty programs with their members, points, messages and
				logos. Cards already in your customers' wallets stop updating. This
				cannot be undone.
			</p>
			{confirming ? (
				<form onSubmit={form.onSubmit} noValidate>
					<FieldGroup>
						<FormAlert>{form.formError}</FormAlert>
						<FormField
							id="field-deletionPassword"
							name="password"
							label="Your password"
							type="password"
							autoComplete="current-password"
							error={form.fieldErrors.password}
						/>
						<div className="flex flex-wrap gap-2">
							<Button
								type="submit"
								variant="destructive"
								disabled={form.pending}
							>
								{form.pending ? "Deleting…" : "Delete my account"}
							</Button>
							<Button
								type="button"
								variant="outline"
								disabled={form.pending}
								onClick={() => setConfirming(false)}
							>
								Cancel
							</Button>
						</div>
					</FieldGroup>
				</form>
			) : (
				<Button
					variant="outline"
					className="self-start"
					onClick={() => setConfirming(true)}
				>
					Delete the account
				</Button>
			)}
		</section>
	);
}
