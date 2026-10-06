import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/** Copies `value` to the clipboard and says so for a moment. */
export function CopyButton({
	value,
	label = "Copy link",
}: {
	value: string;
	label?: string;
}) {
	const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

	useEffect(() => {
		if (status === "idle") {
			return;
		}
		const timeout = setTimeout(() => setStatus("idle"), 2000);
		return () => clearTimeout(timeout);
	}, [status]);

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			setStatus("copied");
		} catch {
			setStatus("failed");
		}
	}

	return (
		<Button type="button" variant="outline" onClick={copy}>
			{status === "copied"
				? "Copied"
				: status === "failed"
					? "Could not copy"
					: label}
		</Button>
	);
}
