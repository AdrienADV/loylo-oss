import type { PostgrestError } from "@supabase/supabase-js";

/** Logs a database error and returns one that is safe to show to users. */
export function databaseError(action: string, error: PostgrestError): Error {
	console.error(`Could not ${action}`, error.code, error.message);
	return new Error(`Could not ${action}. Try again in a moment.`);
}

/** Whether `error` comes from the unique constraint named `constraint`. */
export function isUniqueViolation(
	error: PostgrestError,
	constraint: string,
): boolean {
	return error.code === "23505" && error.message.includes(`"${constraint}"`);
}

/** Whether `error` comes from the check constraint named `constraint`. */
export function isCheckViolation(
	error: PostgrestError,
	constraint: string,
): boolean {
	return error.code === "23514" && error.message.includes(`"${constraint}"`);
}
