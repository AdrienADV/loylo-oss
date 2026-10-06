import type { ComponentProps } from "react";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface FormFieldProps extends ComponentProps<typeof Input> {
	name: string;
	label: string;
	error?: string;
}

/**
 * Labelled input with its validation message. The ID defaults to
 * `field-{name}`: pass one when two forms of a page share a field name.
 */
export function FormField({
	name,
	label,
	error,
	id = `field-${name}`,
	...inputProps
}: FormFieldProps) {
	return (
		<Field data-invalid={error ? true : undefined}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input
				id={id}
				name={name}
				aria-invalid={error ? true : undefined}
				{...inputProps}
			/>
			<FieldError>{error}</FieldError>
		</Field>
	);
}
