import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/dashboard")({
	component: DashboardPage,
});

function DashboardPage() {
	return (
		<section className="flex flex-col gap-2">
			<h1 className="font-semibold text-2xl">Your loyalty programs</h1>
			<p className="text-muted-foreground">You have no loyalty program yet.</p>
		</section>
	);
}
