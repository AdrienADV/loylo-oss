import { createFileRoute, Link } from "@tanstack/react-router";
import { ProgramCard } from "#/features/programs/components/program-card";
import { listPrograms } from "#/features/programs/programs.functions";
import { buttonVariants } from "@/components/ui/button";

export const Route = createFileRoute("/_authed/dashboard")({
	loader: () => listPrograms(),
	component: DashboardPage,
});

function DashboardPage() {
	const programs = Route.useLoaderData();

	return (
		<section className="flex flex-col gap-6">
			<div className="flex items-center justify-between gap-4">
				<h1 className="font-semibold text-2xl">Your loyalty programs</h1>
				<Link to="/programs/new" className={buttonVariants()}>
					New program
				</Link>
			</div>
			{programs.length === 0 ? (
				<p className="text-muted-foreground">
					You have no loyalty program yet. Create one to design your card.
				</p>
			) : (
				<ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{programs.map((program) => (
						<li key={program.id}>
							<ProgramCard program={program} />
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
