import { useState } from "react";
import {
	type MemberPassFields,
	memberPassFieldsSchema,
	WALLET_PROVIDERS,
	type WalletProvider,
} from "#/features/members/members.schemas";
import { useSchemaForm } from "#/lib/forms";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";

/**
 * Name and email of the customer, with one submit button per available
 * wallet: the clicked button picks the wallet.
 */
export function MemberPassForm({
	wallets,
	submitLabels,
	pendingLabel,
	autofill,
	onSubmit,
}: {
	wallets: Record<WalletProvider, boolean>;
	submitLabels: Record<WalletProvider, string>;
	pendingLabel: string;
	/** Offer the browser's saved name and email: only when customers fill the form themselves. */
	autofill: boolean;
	onSubmit: (fields: MemberPassFields) => Promise<void>;
}) {
	const [submitted, setSubmitted] = useState<WalletProvider | null>(null);
	const form = useSchemaForm(memberPassFieldsSchema, async (fields) => {
		setSubmitted(fields.provider);
		await onSubmit(fields);
	});

	return (
		<form onSubmit={form.onSubmit} noValidate>
			<FieldGroup>
				<FormAlert>{form.formError}</FormAlert>
				<FormField
					name="firstName"
					label="First name"
					autoComplete={autofill ? "given-name" : "off"}
					error={form.fieldErrors.firstName}
				/>
				<FormField
					name="lastName"
					label="Last name"
					autoComplete={autofill ? "family-name" : "off"}
					error={form.fieldErrors.lastName}
				/>
				<FormField
					name="email"
					label="Email"
					type="email"
					autoComplete={autofill ? "email" : "off"}
					error={form.fieldErrors.email}
				/>
				<FormAlert>{form.fieldErrors.provider}</FormAlert>
				<div className="flex flex-col gap-2">
					{WALLET_PROVIDERS.filter((provider) => wallets[provider]).map(
						(provider) => (
							<Button
								key={provider}
								type="submit"
								name="provider"
								value={provider}
								disabled={form.pending}
							>
								{form.pending && submitted === provider
									? pendingLabel
									: submitLabels[provider]}
							</Button>
						),
					)}
				</div>
			</FieldGroup>
		</form>
	);
}
