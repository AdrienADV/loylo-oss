import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { PointsForm } from "#/features/members/components/points-form";
import {
	INSTALL_STATE_LABELS,
	WALLET_NAMES,
} from "#/features/members/components/wallet-state-badge";
import {
	adjustPoints,
	getMember,
	listTransactions,
	retryWalletSync,
} from "#/features/members/members.functions";
import type {
	MemberPassView,
	TransactionView,
} from "#/features/members/members.server";
import type { WalletSyncResult } from "#/features/wallet-sync/wallet-sync";
import { FormAlert } from "@/components/form-alert";
import { FormattedDate } from "@/components/formatted-date";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
	"/_authed/programs/$programId/members/$memberId",
)({
	validateSearch: z.object({
		/** History page: changes older than this transaction ID. */
		before: z.int().positive().optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ before: search.before }),
	loader: async ({ params, deps }) => {
		const ids = z
			.object({ programId: z.uuid(), memberId: z.uuid() })
			.safeParse(params);
		if (!ids.success) {
			throw notFound();
		}
		const [member, history] = await Promise.all([
			getMember({ data: ids.data }),
			listTransactions({
				data: { memberId: ids.data.memberId, before: deps.before },
			}),
		]);
		return { member, history };
	},
	component: MemberPage,
	notFoundComponent: () => (
		<p className="text-muted-foreground">This member does not exist.</p>
	),
});

interface PointsNotice {
	memberId: string;
	message: string;
	walletSync: WalletSyncResult;
}

function MemberPage() {
	const { programId } = Route.useParams();
	const { member, history } = Route.useLoaderData();
	const router = useRouter();
	const adjustPointsFn = useServerFn(adjustPoints);
	const [notice, setNotice] = useState<PointsNotice | null>(null);

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="flex min-w-0 flex-col gap-1">
					<Link
						to="/programs/$programId"
						params={{ programId }}
						className="text-muted-foreground text-sm"
					>
						← Members
					</Link>
					<h2 className="truncate font-semibold text-xl">{member.name}</h2>
					<p className="truncate text-muted-foreground text-sm">
						{member.email} · Member since{" "}
						<FormattedDate value={member.createdAt} />
					</p>
				</div>
				<Link
					to="/programs/$programId/scan"
					params={{ programId }}
					className={buttonVariants({ variant: "outline" })}
				>
					Scan another card
				</Link>
			</div>

			<section className="flex max-w-md flex-col gap-4">
				<div>
					<div className="text-muted-foreground text-sm">Balance</div>
					<div className="font-semibold text-4xl tabular-nums">
						{member.points}{" "}
						<span className="font-normal text-base text-muted-foreground">
							points
						</span>
					</div>
				</div>
				{notice?.memberId === member.id ? (
					<PointsNoticeAlert
						notice={notice}
						memberId={member.id}
						onRetried={(walletSync) => setNotice({ ...notice, walletSync })}
					/>
				) : null}
				<PointsForm
					balance={member.points}
					onSubmit={async ({ points, direction }) => {
						setNotice(null);
						const result = await adjustPointsFn({
							data: { memberId: member.id, points, direction },
						});
						await router.invalidate({ sync: true });
						setNotice({
							memberId: member.id,
							message: `${direction === "add" ? "Added" : "Redeemed"} ${points} points. New balance: ${result.points}.`,
							walletSync: result.walletSync,
						});
					}}
				/>
			</section>

			<section className="flex flex-col gap-3">
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<h3 className="font-semibold">Cards</h3>
					<Link
						to="/programs/$programId/members/new"
						params={{ programId }}
						className="text-muted-foreground text-sm underline-offset-4 hover:underline"
					>
						Issue a new card
					</Link>
				</div>
				<ul className="divide-y rounded-2xl border">
					{member.passes.map((pass) => (
						<PassRow key={pass.id} pass={pass} />
					))}
				</ul>
			</section>

			<section className="flex flex-col gap-3">
				<h3 className="font-semibold">History</h3>
				<History
					programId={programId}
					memberId={member.id}
					transactions={history.transactions}
					nextBefore={history.nextBefore}
				/>
			</section>
		</div>
	);
}

/** Points saved, and whether the member's wallet cards show them. */
function PointsNoticeAlert({
	notice,
	memberId,
	onRetried,
}: {
	notice: PointsNotice;
	memberId: string;
	onRetried: (walletSync: WalletSyncResult) => void;
}) {
	const retryFn = useServerFn(retryWalletSync);
	const [pending, setPending] = useState(false);

	async function retry() {
		setPending(true);
		try {
			const { walletSync } = await retryFn({ data: { memberId } });
			onRetried(walletSync);
		} catch {
			onRetried("failed");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<FormAlert tone="success">{notice.message}</FormAlert>
			{notice.walletSync === "failed" ? (
				<div className="flex flex-col items-start gap-2">
					<FormAlert>
						The member's wallet cards could not be updated: they may still show
						the previous balance.
					</FormAlert>
					<Button
						variant="outline"
						size="sm"
						disabled={pending}
						onClick={retry}
					>
						{pending ? "Updating…" : "Update the cards again"}
					</Button>
				</div>
			) : null}
		</div>
	);
}

function PassRow({ pass }: { pass: MemberPassView }) {
	return (
		<li className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
			<span className="font-medium">{WALLET_NAMES[pass.provider]}</span>
			<span className="text-muted-foreground">
				{INSTALL_STATE_LABELS[pass.state]}
				{pass.stateChangedAt ? (
					<>
						{pass.state === "removed" ? " on " : " since "}
						<FormattedDate value={pass.stateChangedAt} />
					</>
				) : null}
				{" · Issued "}
				<FormattedDate value={pass.issuedAt} />
			</span>
		</li>
	);
}

function transactionLabel(transaction: TransactionView): string {
	if (transaction.kind === "welcome") {
		return "Welcome points";
	}
	return transaction.delta > 0 ? "Points added" : "Points redeemed";
}

function History({
	programId,
	memberId,
	transactions,
	nextBefore,
}: {
	programId: string;
	memberId: string;
	transactions: TransactionView[];
	nextBefore: number | null;
}) {
	const { before } = Route.useSearch();

	if (transactions.length === 0) {
		return <p className="text-muted-foreground text-sm">No points yet.</p>;
	}

	return (
		<div className="flex flex-col gap-3">
			<ul className="divide-y rounded-2xl border">
				{transactions.map((transaction) => (
					<li
						key={transaction.id}
						className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
					>
						<span className="flex flex-col">
							<span>{transactionLabel(transaction)}</span>
							<span className="text-muted-foreground text-xs">
								<FormattedDate value={transaction.createdAt} withTime />
							</span>
						</span>
						<span className="flex flex-col items-end tabular-nums">
							<span
								className={cn(
									"font-medium",
									transaction.delta < 0 && "text-destructive",
								)}
							>
								{transaction.delta > 0
									? `+${transaction.delta}`
									: `−${-transaction.delta}`}
							</span>
							<span className="text-muted-foreground text-xs">
								Balance {transaction.balanceAfter}
							</span>
						</span>
					</li>
				))}
			</ul>
			{before || nextBefore ? (
				<nav className="flex justify-between gap-2" aria-label="History pages">
					{before ? (
						<Link
							to="/programs/$programId/members/$memberId"
							params={{ programId, memberId }}
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							Latest changes
						</Link>
					) : (
						<span />
					)}
					{nextBefore ? (
						<Link
							to="/programs/$programId/members/$memberId"
							params={{ programId, memberId }}
							search={{ before: nextBefore }}
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							Older changes
						</Link>
					) : null}
				</nav>
			) : null}
		</div>
	);
}
