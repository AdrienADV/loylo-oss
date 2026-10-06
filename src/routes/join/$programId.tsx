import { createFileRoute, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import {
	enroll,
	getPublicProgram,
} from "#/features/enrollment/enrollment.functions";
import { MemberPassForm } from "#/features/members/components/member-pass-form";
import type { WalletProvider } from "#/features/members/members.schemas";
import { pickForegroundColor } from "#/lib/colors";
import { buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

/** Public enrollment page: the link and QR code merchants share. */
export const Route = createFileRoute("/join/$programId")({
	loader: ({ params }) => {
		if (!z.uuid().safeParse(params.programId).success) {
			throw notFound();
		}
		return getPublicProgram({ data: { programId: params.programId } });
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData
					? `Join ${loaderData.program.name}`
					: "Loyalty program not found",
			},
		],
	}),
	component: JoinPage,
	notFoundComponent: () => (
		<main className="flex min-h-svh items-center justify-center p-6">
			<p className="text-muted-foreground">
				This loyalty program does not exist.
			</p>
		</main>
	),
});

const ADD_LABELS: Record<WalletProvider, string> = {
	apple: "Add to Apple Wallet",
	google: "Add to Google Wallet",
};

function JoinPage() {
	const { program, wallets } = Route.useLoaderData();
	const enrollFn = useServerFn(enroll);
	const [pass, setPass] = useState<{
		provider: WalletProvider;
		link: string;
	} | null>(null);
	const hasWallet = wallets.apple || wallets.google;

	return (
		<main className="flex min-h-svh items-center justify-center p-6">
			<Card className="w-full max-w-sm pt-0">
				<div
					className="flex items-center gap-3 px-6 py-4"
					style={{
						backgroundColor: program.backgroundColor,
						color: pickForegroundColor(program.backgroundColor),
					}}
				>
					{program.logoUrl ? (
						<img
							src={program.logoUrl}
							alt=""
							className="h-8 max-w-28 object-contain"
						/>
					) : null}
					<span className="truncate font-semibold">{program.name}</span>
				</div>
				<CardHeader>
					<CardTitle>
						{pass ? "Your card is ready" : "Get your loyalty card"}
					</CardTitle>
					<CardDescription>
						{pass
							? "If your wallet did not open, use the button below."
							: `Join ${program.name}'s loyalty program and keep your card in your phone's wallet.${
									program.initialPoints > 0
										? ` You start with ${program.initialPoints} points.`
										: ""
								}`}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{pass ? (
						<a
							href={pass.link}
							className={buttonVariants({ size: "lg", className: "w-full" })}
						>
							{ADD_LABELS[pass.provider]}
						</a>
					) : hasWallet ? (
						<MemberPassForm
							wallets={wallets}
							submitLabels={ADD_LABELS}
							pendingLabel="Preparing your card…"
							autofill
							onSubmit={async (fields) => {
								const { passLink } = await enrollFn({
									data: { ...fields, programId: program.id },
								});
								setPass({ provider: fields.provider, link: passLink });
								// Opens the pass: Safari offers to add the `.pkpass`, and
								// the Google link redirects to Google Wallet.
								window.location.assign(passLink);
							}}
						/>
					) : (
						<p className="text-muted-foreground text-sm">
							Cards for this program cannot be added to a wallet yet. Come back
							later.
						</p>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
