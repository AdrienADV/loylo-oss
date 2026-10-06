import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Message about the whole form: an error, or a confirmation. */
export function FormAlert({
	children,
	tone = "error",
}: {
	children: ReactNode;
	tone?: "error" | "success";
}) {
	if (!children) {
		return null;
	}
	return (
		<p
			role={tone === "error" ? "alert" : "status"}
			className={cn(
				"rounded-2xl px-4 py-3 text-sm",
				tone === "error"
					? "bg-destructive/10 text-destructive"
					: "bg-muted text-foreground",
			)}
		>
			{children}
		</p>
	);
}
