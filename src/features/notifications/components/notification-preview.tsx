import { hexColorSchema } from "#/lib/colors";

/** Roughly how the message looks as a notification on a customer's phone. */
export function NotificationPreview({
	programName,
	backgroundColor,
	logoUrl,
	message,
}: {
	programName: string;
	backgroundColor: string;
	logoUrl: string | null;
	message: string;
}) {
	const color = hexColorSchema.safeParse(backgroundColor);

	return (
		<figure
			aria-label="Notification preview"
			className="flex items-start gap-3 rounded-3xl bg-muted p-3"
		>
			<div
				className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl"
				style={{ backgroundColor: color.success ? color.data : undefined }}
			>
				{logoUrl ? (
					<img
						src={logoUrl}
						alt=""
						className="max-h-8 max-w-8 object-contain"
					/>
				) : null}
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<div className="flex items-baseline justify-between gap-2 text-sm">
					<span className="truncate font-semibold">{programName}</span>
					<span className="shrink-0 text-muted-foreground text-xs">now</span>
				</div>
				<p className="whitespace-pre-line break-words text-sm">
					{message.trim() || "Your message"}
				</p>
			</div>
		</figure>
	);
}
