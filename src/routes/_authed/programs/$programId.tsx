import {
	createFileRoute,
	Link,
	notFound,
	Outlet,
} from "@tanstack/react-router";
import { z } from "zod";

import { getProgram } from "#/features/programs/programs.functions";

export const Route = createFileRoute("/_authed/programs/$programId")({
	loader: ({ params }) => {
		if (!z.uuid().safeParse(params.programId).success) {
			throw notFound();
		}
		return getProgram({ data: { programId: params.programId } });
	},
	component: ProgramLayout,
	notFoundComponent: () => (
		<p className="text-muted-foreground">This program does not exist.</p>
	),
});

const tabClass =
	"rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground";

function ProgramLayout() {
	const program = Route.useLoaderData();

	return (
		<section className="flex flex-col gap-6">
			<div className="flex flex-col gap-3">
				<Link to="/dashboard" className="text-muted-foreground text-sm">
					← All programs
				</Link>
				<h1 className="font-semibold text-2xl">{program.name}</h1>
				<nav className="flex gap-1">
					<Link
						to="/programs/$programId"
						params={{ programId: program.id }}
						activeOptions={{ exact: true }}
						className={tabClass}
						activeProps={{ className: "bg-muted text-foreground" }}
					>
						Overview
					</Link>
					<Link
						to="/programs/$programId/share"
						params={{ programId: program.id }}
						className={tabClass}
						activeProps={{ className: "bg-muted text-foreground" }}
					>
						Share
					</Link>
					<Link
						to="/programs/$programId/settings"
						params={{ programId: program.id }}
						className={tabClass}
						activeProps={{ className: "bg-muted text-foreground" }}
					>
						Settings
					</Link>
				</nav>
			</div>
			<Outlet />
		</section>
	);
}
