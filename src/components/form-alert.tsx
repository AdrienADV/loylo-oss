import type { ReactNode } from "react";

/** Error about the whole form. Successes show as toasts. */
export function FormAlert({ children }: { children: ReactNode }) {
	if (!children) {
		return null;
	}
	return (
		<p
			role="alert"
			className="rounded-2xl bg-destructive/10 px-4 py-3 text-destructive text-sm"
		>
			{children}
		</p>
	);
}
