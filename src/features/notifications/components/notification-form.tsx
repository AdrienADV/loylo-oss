import { useState } from "react";

import { NotificationPreview } from "#/features/notifications/components/notification-preview";
import {
	MAX_MESSAGE_LENGTH,
	notificationFieldsSchema,
} from "#/features/notifications/notifications.schemas";
import { useSchemaForm } from "#/lib/forms";
import { FormAlert } from "@/components/form-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

/**
 * Writes a message with a live preview. Sending takes a confirmation: it
 * reaches every customer and cannot be undone.
 */
export function NotificationForm({
	program,
	disabled,
	onSend,
}: {
	program: { name: string; backgroundColor: string; logoUrl: string | null };
	/** The sending rules do not allow a message now. */
	disabled: boolean;
	onSend: (message: string) => Promise<void>;
}) {
	const [message, setMessage] = useState("");
	const [confirming, setConfirming] = useState(false);
	const form = useSchemaForm(notificationFieldsSchema, async (fields) => {
		if (!confirming) {
			setConfirming(true);
			return;
		}
		try {
			await onSend(fields.message);
			setMessage("");
		} finally {
			setConfirming(false);
		}
	});

	return (
		<form onSubmit={form.onSubmit} noValidate className="flex flex-col gap-4">
			<FormAlert>{form.formError}</FormAlert>
			<Field data-invalid={form.fieldErrors.message ? true : undefined}>
				<div className="flex items-baseline justify-between gap-2">
					<FieldLabel htmlFor="field-message">Message</FieldLabel>
					<span className="text-muted-foreground text-xs tabular-nums">
						{message.length}/{MAX_MESSAGE_LENGTH}
					</span>
				</div>
				<Textarea
					id="field-message"
					name="message"
					rows={3}
					maxLength={MAX_MESSAGE_LENGTH}
					value={message}
					onChange={(event) => setMessage(event.target.value)}
					readOnly={confirming}
					disabled={disabled}
					placeholder="Double points on every coffee this weekend!"
					aria-invalid={form.fieldErrors.message ? true : undefined}
				/>
				<FieldError>{form.fieldErrors.message}</FieldError>
			</Field>
			<NotificationPreview
				programName={program.name}
				backgroundColor={program.backgroundColor}
				logoUrl={program.logoUrl}
				message={message}
			/>
			{confirming ? (
				<div className="flex flex-col gap-3 rounded-2xl border p-4">
					<p className="text-sm">
						Send this message to every customer with the card? It cannot be
						undone.
					</p>
					<div className="flex flex-wrap gap-2">
						<Button type="submit" disabled={form.pending}>
							{form.pending ? "Sending…" : "Send now"}
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={form.pending}
							onClick={() => setConfirming(false)}
						>
							Edit
						</Button>
					</div>
				</div>
			) : (
				<Button type="submit" className="self-start" disabled={disabled}>
					Send to all members
				</Button>
			)}
		</form>
	);
}
