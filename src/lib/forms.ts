import { type FormEvent, useState } from "react";
import type { z } from "zod";

type FieldErrors = Partial<Record<string, string>>;

function firstErrorPerField(error: z.ZodError): FieldErrors {
	const errors: FieldErrors = {};
	for (const issue of error.issues) {
		const field = String(issue.path[0] ?? "");
		errors[field] ??= issue.message;
	}
	return errors;
}

/**
 * Validates a form with the same Zod schema as its server function, then runs
 * `onValid`. Errors thrown by `onValid` (server function messages) are shown
 * as a form-level error. The clicked submit button's `name` and `value` are
 * part of the data, as in a native form submission.
 */
export function useSchemaForm<TSchema extends z.ZodType>(
	schema: TSchema,
	onValid: (data: z.output<TSchema>) => Promise<void>,
) {
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
	const [formError, setFormError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError(null);

		const submitter = (event.nativeEvent as SubmitEvent).submitter;
		const result = schema.safeParse(
			Object.fromEntries(new FormData(event.currentTarget, submitter)),
		);
		if (!result.success) {
			setFieldErrors(firstErrorPerField(result.error));
			return;
		}

		setFieldErrors({});
		setPending(true);
		try {
			await onValid(result.data);
		} catch (error) {
			setFormError(
				error instanceof Error ? error.message : "Something went wrong.",
			);
		} finally {
			setPending(false);
		}
	}

	return { onSubmit, fieldErrors, formError, pending };
}
