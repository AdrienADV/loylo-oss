import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MemberPassForm } from "#/features/members/components/member-pass-form";
import {
	issuePass,
	listAvailableWallets,
} from "#/features/members/members.functions";
import { getAppOrigin } from "#/lib/app-origin";
import { CopyButton } from "@/components/copy-button";
import { FormAlert } from "@/components/form-alert";
import { QrCode } from "@/components/qr-code";
import { Button } from "@/components/ui/button";

const programRoute = getRouteApi("/_authed/programs/$programId");

export const Route = createFileRoute(
	"/_authed/programs/$programId/members/new",
)({
	loader: () => listAvailableWallets(),
	component: IssuePassPage,
});

interface IssuedPass {
	url: string;
	memberName: string;
	memberCreated: boolean;
}

function IssuePassPage() {
	const program = programRoute.useLoaderData();
	const wallets = Route.useLoaderData();
	const issuePassFn = useServerFn(issuePass);
	const [issued, setIssued] = useState<IssuedPass | null>(null);

	if (issued) {
		return <IssuedPassCard issued={issued} onDone={() => setIssued(null)} />;
	}

	return (
		<div className="flex max-w-md flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="font-semibold text-lg">Issue a card</h2>
				<p className="text-muted-foreground text-sm">
					For a customer at your counter. A customer who already has a card gets
					a new one with their current points.
				</p>
			</div>
			{wallets.apple || wallets.google ? (
				<MemberPassForm
					wallets={wallets}
					submitLabels={{
						apple: "Issue an Apple Wallet card",
						google: "Issue a Google Wallet card",
					}}
					pendingLabel="Issuing…"
					autofill={false}
					onSubmit={async (fields) => {
						const { passLink, memberCreated } = await issuePassFn({
							data: { ...fields, programId: program.id },
						});
						setIssued({
							url: `${getAppOrigin()}${passLink}`,
							memberName: `${fields.firstName} ${fields.lastName}`,
							memberCreated,
						});
					}}
				/>
			) : (
				<FormAlert>
					No wallet is configured: set up Apple Wallet or Google Wallet to issue
					cards.
				</FormAlert>
			)}
		</div>
	);
}

function IssuedPassCard({
	issued,
	onDone,
}: {
	issued: IssuedPass;
	onDone: () => void;
}) {
	return (
		<div className="flex max-w-md flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="font-semibold text-lg">
					Card ready for {issued.memberName}
				</h2>
				<p className="text-muted-foreground text-sm">
					{issued.memberCreated
						? "Ask the customer to scan this code with their phone's camera to add the card, or send them the link."
						: "This email was already a member: the new card keeps their points. Ask the customer to scan this code with their phone's camera, or send them the link."}
				</p>
			</div>
			<QrCode
				value={issued.url}
				label={`QR code of ${issued.memberName}'s card`}
				className="size-56"
			/>
			<div className="flex flex-wrap gap-2">
				<CopyButton value={issued.url} />
				<Button variant="outline" onClick={onDone}>
					Issue another card
				</Button>
			</div>
		</div>
	);
}
