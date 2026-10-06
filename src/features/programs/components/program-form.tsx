import { useEffect, useRef, useState } from "react";
import { PassPreview } from "#/features/programs/components/pass-preview";
import { renderProgramImages } from "#/features/programs/program-images";
import { programFieldsSchema } from "#/features/programs/programs.schemas";
import { useSchemaForm } from "#/lib/forms";
import { FormAlert } from "@/components/form-alert";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export interface ProgramFormValues {
	name: string;
	backgroundColor: string;
	initialPoints: number;
	logoUrl: string | null;
}

const EMPTY_VALUES: ProgramFormValues = {
	name: "",
	backgroundColor: "#1d4fd7",
	initialPoints: 0,
	logoUrl: null,
};

/**
 * Program fields with a live pass preview. Sends a FormData with the fields
 * and, when a logo was chosen, the images generated from it.
 */
export function ProgramForm({
	initialValues = EMPTY_VALUES,
	submitLabel,
	pendingLabel,
	onSubmit,
}: {
	initialValues?: ProgramFormValues;
	submitLabel: string;
	pendingLabel: string;
	onSubmit: (formData: FormData) => Promise<void>;
}) {
	const [name, setName] = useState(initialValues.name);
	const [backgroundColor, setBackgroundColor] = useState(
		initialValues.backgroundColor,
	);
	const [initialPoints, setInitialPoints] = useState(
		String(initialValues.initialPoints),
	);
	const [logoFile, setLogoFile] = useState<File | null>(null);
	const logoInput = useRef<HTMLInputElement>(null);
	const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!logoFile) {
			setLogoPreviewUrl(null);
			return;
		}
		const url = URL.createObjectURL(logoFile);
		setLogoPreviewUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [logoFile]);

	const form = useSchemaForm(programFieldsSchema, async (fields) => {
		const formData = new FormData();
		formData.set("name", fields.name);
		formData.set("backgroundColor", fields.backgroundColor);
		formData.set("initialPoints", String(fields.initialPoints));
		if (logoFile) {
			const images = await renderProgramImages(logoFile);
			for (const [imageName, blob] of Object.entries(images)) {
				formData.set(imageName, blob, imageName);
			}
		} else if (!initialValues.logoUrl) {
			throw new Error("Add a logo.");
		}
		await onSubmit(formData);
		// Saved: the next submit only re-uploads the logo if another one is chosen.
		setLogoFile(null);
		if (logoInput.current) {
			logoInput.current.value = "";
		}
	});

	return (
		<div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_20rem]">
			<form onSubmit={form.onSubmit} noValidate>
				<FieldGroup>
					<FormAlert>{form.formError}</FormAlert>
					<FormField
						name="name"
						label="Business name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						error={form.fieldErrors.name}
					/>
					<Field
						data-invalid={form.fieldErrors.backgroundColor ? true : undefined}
					>
						<FieldLabel htmlFor="field-backgroundColor">Card color</FieldLabel>
						<div className="flex items-center gap-3">
							<input
								id="field-backgroundColor"
								name="backgroundColor"
								type="color"
								value={backgroundColor}
								onChange={(event) => setBackgroundColor(event.target.value)}
								className="h-9 w-16 cursor-pointer rounded-xl border bg-transparent"
							/>
							<span className="font-mono text-muted-foreground text-sm">
								{backgroundColor}
							</span>
						</div>
						<FieldError>{form.fieldErrors.backgroundColor}</FieldError>
					</Field>
					<FormField
						name="initialPoints"
						label="Welcome points"
						type="number"
						min={0}
						step={1}
						inputMode="numeric"
						value={initialPoints}
						onChange={(event) => setInitialPoints(event.target.value)}
						error={form.fieldErrors.initialPoints}
					/>
					<Field>
						<FieldLabel htmlFor="field-logo">Logo</FieldLabel>
						<Input
							ref={logoInput}
							id="field-logo"
							name="logo"
							type="file"
							accept="image/png,image/jpeg,image/webp"
							onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
						/>
						<FieldDescription>
							PNG, JPEG or WebP. A square logo on a transparent background works
							best.
						</FieldDescription>
					</Field>
					<Button type="submit" disabled={form.pending}>
						{form.pending ? pendingLabel : submitLabel}
					</Button>
				</FieldGroup>
			</form>
			<PassPreview
				name={name}
				backgroundColor={backgroundColor}
				points={Number.parseInt(initialPoints, 10) || 0}
				logoUrl={logoPreviewUrl ?? initialValues.logoUrl}
			/>
		</div>
	);
}
