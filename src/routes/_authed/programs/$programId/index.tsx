import {
	createFileRoute,
	getRouteApi,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import type { FormEvent } from "react";
import { z } from "zod";
import { MemberList } from "#/features/members/components/member-list";
import { listMembers } from "#/features/members/members.functions";
import { memberCursorSchema } from "#/features/members/members.schemas";
import { PassPreview } from "#/features/programs/components/pass-preview";
import { FormAlert } from "@/components/form-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const programRoute = getRouteApi("/_authed/programs/$programId");

export const Route = createFileRoute("/_authed/programs/$programId/")({
	validateSearch: z.object({
		walletSync: z.literal("failed").optional().catch(undefined),
		/** Search in members' names and emails (`?q=42` arrives as a number). */
		q: z.coerce.string().max(100).optional().catch(undefined),
		/** Cursor of the members page: see `listMembers`. */
		after: z
			.string()
			.refine((cursor) => memberCursorSchema.safeParse(cursor).success)
			.optional()
			.catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ q: search.q, after: search.after }),
	loader: ({ params, deps }) => {
		if (!z.uuid().safeParse(params.programId).success) {
			throw notFound();
		}
		return listMembers({
			data: { programId: params.programId, search: deps.q, after: deps.after },
		});
	},
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
			<div className="flex flex-wrap gap-2">
				<Link
					to="/programs/$programId/scan"
					params={{ programId: program.id }}
					className={buttonVariants()}
				>
					Scan a card
				</Link>
				<Link
					to="/programs/$programId/members/new"
					params={{ programId: program.id }}
					className={buttonVariants({ variant: "outline" })}
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
			<div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
				<Members />
				<aside className="flex flex-col gap-3">
					<PassPreview
						name={program.name}
						backgroundColor={program.backgroundColor}
						points={program.initialPoints}
						logoUrl={program.logoUrl}
					/>
					<p className="text-muted-foreground text-sm">
						New members start with {program.initialPoints} points.
					</p>
				</aside>
			</div>
		</div>
	);
}

function Members() {
	const program = programRoute.useLoaderData();
	const { members, nextCursor, total } = Route.useLoaderData();
	const { q, after } = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });

	function handleSearch(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const search = new FormData(event.currentTarget).get("q");
		void navigate({
			search: {
				q: typeof search === "string" && search.trim() ? search : undefined,
			},
		});
	}

	return (
		<section className="flex min-w-0 flex-col gap-4">
			<div className="flex items-baseline justify-between gap-4">
				<h2 className="font-semibold text-lg">Members</h2>
				<span className="text-muted-foreground text-sm">
					{total === 1 ? "1 member" : `${total} members`}
				</span>
			</div>
			<search>
				<form onSubmit={handleSearch} className="flex gap-2">
					<Input
						key={q}
						name="q"
						type="search"
						defaultValue={q}
						maxLength={100}
						placeholder="Search by name or email"
						aria-label="Search members"
					/>
					<Button type="submit" variant="outline">
						Search
					</Button>
				</form>
			</search>
			{members.length > 0 ? (
				<MemberList programId={program.id} members={members} />
			) : (
				<p className="text-muted-foreground text-sm">
					{q
						? `No member matches “${q}”.`
						: after
							? "No more members."
							: "No members yet. Issue a card at your counter, or share the enrollment link."}
				</p>
			)}
			{after || nextCursor ? (
				<nav className="flex justify-between gap-2" aria-label="Members pages">
					{after ? (
						<Link
							from={Route.fullPath}
							search={{ q }}
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							Newest members
						</Link>
					) : (
						<span />
					)}
					{nextCursor ? (
						<Link
							from={Route.fullPath}
							search={{ q, after: nextCursor }}
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							Next page
						</Link>
					) : null}
				</nav>
			) : null}
		</section>
	);
}
