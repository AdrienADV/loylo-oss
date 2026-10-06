import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
	return (
		<main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-2 p-6">
			<h1 className="font-semibold text-3xl">Loylo</h1>
			<p className="text-muted-foreground">
				Open-source digital loyalty cards for Apple and Google Wallet.
			</p>
		</main>
	);
}
