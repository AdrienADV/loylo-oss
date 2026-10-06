import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

import { PassPreview } from "#/features/programs/components/pass-preview";
import { FormAlert } from "@/components/form-alert";
import { buttonVariants } from "@/components/ui/button";

const SOURCE_URL = "https://github.com/AdrienADV/loylo-oss";

export const Route = createFileRoute("/")({
	validateSearch: z.object({
		/** Set after the account was deleted. */
		account: z.literal("deleted").optional().catch(undefined),
	}),
	component: Home,
});

const FEATURES = [
	{
		title: "Design your card",
		text: "Your name, color and logo, with a live preview. New members start with the welcome points you choose.",
	},
	{
		title: "Enroll in seconds",
		text: "Share a link or a QR code: customers add the card from their own phone. Or issue it at the counter.",
	},
	{
		title: "Scan and reward",
		text: "Scan the card with your phone's camera, add or redeem points. The card updates in the wallet, and every change stays in the history.",
	},
	{
		title: "Send a message",
		text: "Announce an offer on every card, with a notification. One message a day at most, so customers stay happy.",
	},
];

function Home() {
	const { account } = Route.useSearch();

	return (
		<div className="min-h-svh">
			<header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
				<span className="font-semibold">Loylo</span>
				<nav className="flex items-center gap-2">
					<Link to="/login" className={buttonVariants({ variant: "ghost" })}>
						Sign in
					</Link>
					<Link to="/signup" className={buttonVariants()}>
						Create an account
					</Link>
				</nav>
			</header>
			<main className="mx-auto flex max-w-5xl flex-col gap-16 px-6 pt-8 pb-16">
				{account === "deleted" ? (
					<FormAlert tone="success">
						Your account and its data were deleted.
					</FormAlert>
				) : null}
				<section className="grid items-center gap-10 md:grid-cols-[1fr_auto]">
					<div className="flex flex-col gap-5">
						<h1 className="font-semibold text-4xl tracking-tight md:text-5xl">
							Loyalty cards that live in your customers' phones
						</h1>
						<p className="max-w-xl text-lg text-muted-foreground">
							Loylo is an open-source loyalty program for small businesses.
							Customers add your card to Apple Wallet or Google Wallet; you scan
							it at the counter and their points update on their phone.
						</p>
						<div className="flex flex-wrap gap-2">
							<Link to="/signup" className={buttonVariants({ size: "lg" })}>
								Create your card
							</Link>
							<a
								href={SOURCE_URL}
								className={buttonVariants({ variant: "outline", size: "lg" })}
							>
								Host it yourself
							</a>
						</div>
					</div>
					<div className="flex justify-center">
						<div className="w-72">
							<PassPreview
								name="Bean There Cafe"
								backgroundColor="#1d4fd7"
								points={120}
								logoUrl={null}
							/>
						</div>
					</div>
				</section>
				<section className="grid gap-4 sm:grid-cols-2">
					{FEATURES.map((feature) => (
						<div
							key={feature.title}
							className="flex flex-col gap-2 rounded-2xl bg-muted p-5"
						>
							<h2 className="font-semibold">{feature.title}</h2>
							<p className="text-muted-foreground text-sm">{feature.text}</p>
						</div>
					))}
				</section>
			</main>
			<footer className="border-t">
				<div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-2 px-6 py-6 text-muted-foreground text-sm">
					<span>Open source, built on Cloudflare Workers and Supabase.</span>
					<a href={SOURCE_URL} className="hover:text-foreground">
						Source code
					</a>
				</div>
			</footer>
		</div>
	);
}
