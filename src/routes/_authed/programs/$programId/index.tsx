import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { z } from "zod";
import { PassPreview } from "#/features/programs/components/pass-preview";
import { FormAlert } from "@/components/form-alert";
import { buttonVariants } from "@/components/ui/button";

const programRoute = getRouteApi("/_authed/programs/$programId");

export const Route = createFileRoute("/_authed/programs/$programId/")({
	validateSearch: z.object({
		walletSync: z.literal("failed").optional().catch(undefined),
	}),
	component: ProgramOverviewPage,
});

function ProgramOverviewPage() {
	const program = programRoute.useLoaderData();
	const { walletSync } = Route.useSearch();

	return (
		<div className="flex flex-col gap-6">
			{walletSync === "failed" ? (
				<FormAlert>
					The program is saved, but Google Wallet could not be updated. Save it
					again from the settings to retry.
				</FormAlert>
			) : null}
			<PassPreview
				name={program.name}
				backgroundColor={program.backgroundColor}
				points={program.initialPoints}
				logoUrl={program.logoUrl}
			/>
			<p className="text-muted-foreground text-sm">
				New members start with {program.initialPoints} points.
			</p>
			<div className="flex flex-wrap gap-2">
				<Link
					to="/programs/$programId/members/new"
					params={{ programId: program.id }}
					className={buttonVariants()}
				>
					Issue a card
				</Link>
				<Link
					to="/programs/$programId/share"
					params={{ programId: program.id }}
					className={buttonVariants({ variant: "outline" })}
				>
					Share the enrollment link
				</Link>
			</div>
		</div>
	);
}
