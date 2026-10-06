import { useMemo } from "react";
import { encode } from "uqr";

import { cn } from "@/lib/utils";

/** QR code drawn as an SVG path: crisp at any size and when printed. */
export function QrCode({
	value,
	label,
	className,
}: {
	value: string;
	label: string;
	className?: string;
}) {
	const { size, path } = useMemo(() => {
		const qr = encode(value, { ecc: "M", border: 2 });
		const squares = qr.data.flatMap((row, y) =>
			row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : "")),
		);
		return { size: qr.size, path: squares.join("") };
	}, [value]);

	return (
		<svg
			viewBox={`0 0 ${size} ${size}`}
			role="img"
			aria-label={label}
			shapeRendering="crispEdges"
			className={cn("rounded-xl bg-white", className)}
		>
			<path d={path} fill="#000000" />
		</svg>
	);
}
