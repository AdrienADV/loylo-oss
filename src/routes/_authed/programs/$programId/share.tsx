import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { getAppOrigin } from "#/lib/app-origin";
import { CopyButton } from "@/components/copy-button";
import { QrCode } from "@/components/qr-code";
import { buttonVariants } from "@/components/ui/button";

const programRoute = getRouteApi("/_authed/programs/$programId");

export const Route = createFileRoute("/_authed/programs/$programId/share")({
	component: SharePage,
});

function SharePage() {
	const program = programRoute.useLoaderData();
	const enrollmentUrl = `${getAppOrigin()}/join/${program.id}`;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="font-semibold text-lg">Enrollment link</h2>
				<p className="text-muted-foreground text-sm">
					Customers open this link to join and add the card to their wallet.
					Display the QR code at your counter, or share the link.
				</p>
			</div>
			<div className="flex flex-col gap-3">
				<code className="break-all rounded-2xl bg-muted px-4 py-3 text-sm">
					{enrollmentUrl}
				</code>
				<div className="flex flex-wrap gap-2">
					<CopyButton value={enrollmentUrl} />
					<Link
						to="/join/$programId"
						params={{ programId: program.id }}
						target="_blank"
						className={buttonVariants({ variant: "outline" })}
					>
						Open the page
					</Link>
				</div>
			</div>
			<QrCode
				value={enrollmentUrl}
				label={`QR code of the ${program.name} enrollment link`}
				className="size-56"
			/>
		</div>
	);
}
