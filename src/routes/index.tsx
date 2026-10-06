import { createFileRoute, Link } from "@tanstack/react-router";

import { buttonVariants } from "@/components/ui/button";

export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
	return (
		<main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-4 p-6">
			<h1 className="font-semibold text-3xl">Loylo</h1>
			<p className="text-muted-foreground">
				Open-source digital loyalty cards for Apple and Google Wallet.
			</p>
			<div className="flex gap-2">
				<Link to="/signup" className={buttonVariants()}>
					Create an account
				</Link>
				<Link to="/login" className={buttonVariants({ variant: "outline" })}>
					Sign in
				</Link>
			</div>
		</main>
	);
}
