import { hexColorSchema, pickForegroundColor } from "#/lib/colors";

/**
 * Approximation of the store card Apple Wallet shows, built from the same
 * values as the real pass (`buildApplePassJson`).
 */
export function PassPreview({
	name,
	backgroundColor,
	points,
	logoUrl,
	memberName = "Ada Lovelace",
}: {
	name: string;
	backgroundColor: string;
	points: number;
	logoUrl: string | null;
	memberName?: string;
}) {
	const color = hexColorSchema.safeParse(backgroundColor);
	const background = color.success ? color.data : "#1d4fd7";
	const foreground = pickForegroundColor(background);
	const labelClass =
		"text-[10px] font-semibold uppercase tracking-wide opacity-80";

	return (
		<figure
			className="flex aspect-[1/1.3] w-full max-w-80 flex-col justify-between rounded-2xl p-4 shadow-lg"
			style={{ backgroundColor: background, color: foreground }}
			aria-label="Pass preview"
		>
			<div className="flex items-center gap-3">
				{logoUrl ? (
					<img src={logoUrl} alt="" className="h-8 max-w-28 object-contain" />
				) : (
					<div className="size-8 rounded-full border-2 border-current opacity-50" />
				)}
				<span className="truncate font-semibold">
					{name || "Your business"}
				</span>
			</div>

			<div className="flex flex-col gap-4">
				<div>
					<div className={labelClass}>Points</div>
					<div className="font-light text-4xl">{points}</div>
				</div>
				<div>
					<div className={labelClass}>Member</div>
					<div>{memberName}</div>
				</div>
			</div>

			<div className="mx-auto grid size-24 grid-cols-5 gap-0.5 rounded-lg bg-white p-2">
				{Array.from({ length: 25 }, (_, index) => (
					<span
						// Static pattern standing for the QR code.
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative grid
						key={index}
						className={(index * 7) % 3 === 0 ? "bg-black" : "bg-white"}
					/>
				))}
			</div>
		</figure>
	);
}
