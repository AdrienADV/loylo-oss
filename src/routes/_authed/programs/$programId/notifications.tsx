import {
	createFileRoute,
	getRouteApi,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { NotificationForm } from "#/features/notifications/components/notification-form";
import {
	getNotificationQuota,
	listNotifications,
	sendNotification,
} from "#/features/notifications/notifications.functions";
import type {
	NotificationQuota,
	NotificationView,
} from "#/features/notifications/notifications.server";
import { retryProgramWalletSync } from "#/features/programs/programs.functions";
import type { WalletSyncResult } from "#/features/wallet-sync/wallet-sync";
import { FormAlert } from "@/components/form-alert";
import { FormattedDate } from "@/components/formatted-date";
import { Button } from "@/components/ui/button";

const programRoute = getRouteApi("/_authed/programs/$programId");

export const Route = createFileRoute(
	"/_authed/programs/$programId/notifications",
)({
	loader: async ({ params }) => {
		if (!z.uuid().safeParse(params.programId).success) {
			throw notFound();
		}
		const data = { programId: params.programId };
		const [quota, notifications] = await Promise.all([
			getNotificationQuota({ data }),
			listNotifications({ data }),
		]);
		return { quota, notifications };
	},
	component: NotificationsPage,
});

function NotificationsPage() {
	const program = programRoute.useLoaderData();
	const { quota, notifications } = Route.useLoaderData();
	const router = useRouter();
	const sendNotificationFn = useServerFn(sendNotification);
	const [walletSync, setWalletSync] = useState<WalletSyncResult | null>(null);

	return (
		<div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
			<section className="flex max-w-xl flex-col gap-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-lg">Message your members</h2>
					<p className="text-muted-foreground text-sm">
						Your message shows on every card, and customers who added the card
						to Apple Wallet or Google Wallet get a notification.
					</p>
				</div>
				{quota.monthlyCap === 0 ? (
					<FormAlert>
						Messages are turned off on this Loylo installation.
					</FormAlert>
				) : (
					<>
						<QuotaSummary quota={quota} />
						{walletSync ? (
							<SentNotice
								programId={program.id}
								walletSync={walletSync}
								onRetried={setWalletSync}
							/>
						) : null}
						<NotificationForm
							program={program}
							disabled={quota.availableAt !== null}
							onSend={async (message) => {
								setWalletSync(null);
								const result = await sendNotificationFn({
									data: { programId: program.id, message },
								});
								await router.invalidate({ sync: true });
								setWalletSync(result.walletSync);
							}}
						/>
					</>
				)}
			</section>
			<History notifications={notifications} />
		</div>
	);
}

function QuotaSummary({ quota }: { quota: NotificationQuota }) {
	const left = Math.max(quota.monthlyCap - quota.sentThisMonth, 0);

	return (
		<div className="flex flex-col gap-1 rounded-2xl bg-muted px-4 py-3 text-sm">
			<p>
				<span className="font-medium">
					{left} of {quota.monthlyCap}{" "}
					{quota.monthlyCap === 1 ? "message" : "messages"}
				</span>{" "}
				left this month, one message per 24 hours.
			</p>
			{quota.availableAt ? (
				<p className="text-muted-foreground">
					Your next message can go out on{" "}
					<FormattedDate value={quota.availableAt} withTime />.
				</p>
			) : null}
		</div>
	);
}

/** The message is saved; says whether every wallet could be reached. */
function SentNotice({
	programId,
	walletSync,
	onRetried,
}: {
	programId: string;
	walletSync: WalletSyncResult;
	onRetried: (walletSync: WalletSyncResult) => void;
}) {
	const retryFn = useServerFn(retryProgramWalletSync);
	const [pending, setPending] = useState(false);

	async function retry() {
		setPending(true);
		try {
			onRetried((await retryFn({ data: { programId } })).walletSync);
		} catch {
			onRetried("failed");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<FormAlert tone="success">
				Message sent. Customers with the card will see it shortly.
			</FormAlert>
			{walletSync === "failed" ? (
				<div className="flex flex-col items-start gap-2">
					<FormAlert>
						Some wallet cards could not be updated: they may not show the
						message yet.
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

function History({ notifications }: { notifications: NotificationView[] }) {
	return (
		<aside className="flex flex-col gap-3">
			<h3 className="font-semibold">Sent messages</h3>
			{notifications.length === 0 ? (
				<p className="text-muted-foreground text-sm">No message sent yet.</p>
			) : (
				<ul className="divide-y rounded-2xl border">
					{notifications.map((notification, index) => (
						<li key={notification.id} className="flex flex-col gap-1 px-4 py-3">
							<p className="whitespace-pre-line break-words text-sm">
								{notification.message}
							</p>
							<p className="text-muted-foreground text-xs">
								<FormattedDate value={notification.createdAt} withTime />
								{index === 0 ? " · Shown on the cards now" : null}
							</p>
						</li>
					))}
				</ul>
			)}
		</aside>
	);
}
