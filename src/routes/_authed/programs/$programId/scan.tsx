import {
	createFileRoute,
	getRouteApi,
	useNavigate,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { QrScanner } from "#/features/members/components/qr-scanner";
import { findMemberBySerial } from "#/features/members/members.functions";
import { serialNumberSchema } from "#/features/members/members.schemas";
import { useSchemaForm } from "#/lib/forms";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";

const programRoute = getRouteApi("/_authed/programs/$programId");

export const Route = createFileRoute("/_authed/programs/$programId/scan")({
	component: ScanPage,
});

const cardCodeSchema = z.object({ serialNumber: serialNumberSchema });

/** Scanning a card opens its member: the QR code is the pass's serial number. */
function ScanPage() {
	const program = programRoute.useLoaderData();
	const navigate = useNavigate();
	const findMemberFn = useServerFn(findMemberBySerial);
	const [scanError, setScanError] = useState<string | null>(null);
	const [opening, setOpening] = useState(false);

	async function openCard(serialNumber: string) {
		const { memberId } = await findMemberFn({
			data: { programId: program.id, serialNumber },
		});
		if (!memberId) {
			throw new Error(`This card is not a ${program.name} card.`);
		}
		await navigate({
			to: "/programs/$programId/members/$memberId",
			params: { programId: program.id, memberId },
		});
	}

	async function handleScan(value: string) {
		const serialNumber = serialNumberSchema.safeParse(value);
		if (!serialNumber.success) {
			setScanError("This QR code is not a loyalty card.");
			return;
		}
		setScanError(null);
		setOpening(true);
		try {
			await openCard(serialNumber.data);
		} catch (error) {
			setScanError(
				error instanceof Error ? error.message : "Something went wrong.",
			);
		} finally {
			setOpening(false);
		}
	}

	const form = useSchemaForm(cardCodeSchema, ({ serialNumber }) =>
		openCard(serialNumber),
	);

	return (
		<div className="flex max-w-md flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="font-semibold text-lg">Scan a card</h2>
				<p className="text-muted-foreground text-sm">
					Point the camera at the QR code on the customer's card to open their
					points.
				</p>
			</div>
			<QrScanner onScan={handleScan} paused={opening || form.pending} />
			<FormAlert>{opening ? null : scanError}</FormAlert>
			{opening ? (
				<output className="text-muted-foreground text-sm">
					Opening the card…
				</output>
			) : null}
			<form onSubmit={form.onSubmit} noValidate>
				<FieldGroup>
					<FormAlert>{form.formError}</FormAlert>
					<FormField
						name="serialNumber"
						label="Card code"
						autoComplete="off"
						spellCheck={false}
						placeholder="Or scan with a barcode scanner"
						error={form.fieldErrors.serialNumber}
					/>
					<Button
						type="submit"
						variant="outline"
						className="self-start"
						disabled={form.pending}
					>
						{form.pending ? "Opening…" : "Open the card"}
					</Button>
				</FieldGroup>
			</form>
		</div>
	);
}
