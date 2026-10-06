import { useHydrated } from "@tanstack/react-router";

/**
 * A date in the viewer's time zone. The server does not know it, so the
 * server render (and hydration) use UTC, then the browser shows local time.
 */
export function FormattedDate({
	value,
	withTime = false,
}: {
	value: string;
	withTime?: boolean;
}) {
	const hydrated = useHydrated();
	const formatted = new Intl.DateTimeFormat("en", {
		dateStyle: "medium",
		timeStyle: withTime ? "short" : undefined,
		timeZone: hydrated ? undefined : "UTC",
	}).format(new Date(value));

	return <time dateTime={value}>{formatted}</time>;
}
