import { useRef, useState } from "react";

import {
	type PointsChangeFields,
	pointsChangeFieldsSchema,
} from "#/features/members/members.schemas";
import { useSchemaForm } from "#/lib/forms";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";

/** A number of points, then "Add" or "Redeem": the clicked button decides. */
export function PointsForm({
	balance,
	onSubmit,
}: {
	/** Redeeming is off while the balance is zero. */
	balance: number;
	onSubmit: (fields: PointsChangeFields) => Promise<void>;
}) {
	const formRef = useRef<HTMLFormElement>(null);
	const [submitted, setSubmitted] =
		useState<PointsChangeFields["direction"]>("add");
	const form = useSchemaForm(pointsChangeFieldsSchema, async (fields) => {
		setSubmitted(fields.direction);
		await onSubmit(fields);
		formRef.current?.reset();
	});

	return (
		<form ref={formRef} onSubmit={form.onSubmit} noValidate>
			<FieldGroup>
				<FormAlert>{form.formError}</FormAlert>
				<FormField
					name="points"
					label="Points"
					type="number"
					inputMode="numeric"
					min={1}
					step={1}
					autoComplete="off"
					error={form.fieldErrors.points}
				/>
				<div className="flex flex-wrap gap-2">
					<Button
						type="submit"
						name="direction"
						value="add"
						disabled={form.pending}
					>
						{form.pending && submitted === "add" ? "Adding…" : "Add points"}
					</Button>
					<Button
						type="submit"
						name="direction"
						value="redeem"
						variant="outline"
						disabled={form.pending || balance === 0}
					>
						{form.pending && submitted === "redeem"
							? "Redeeming…"
							: "Redeem points"}
					</Button>
				</div>
			</FieldGroup>
		</form>
	);
}
