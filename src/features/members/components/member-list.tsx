import { Link } from "@tanstack/react-router";

import { WalletStateBadge } from "#/features/members/components/wallet-state-badge";
import type { MemberListItem } from "#/features/members/members.server";

export function MemberList({
	programId,
	members,
}: {
	programId: string;
	members: MemberListItem[];
}) {
	return (
		<ul className="divide-y overflow-hidden rounded-2xl border">
			{members.map((member) => (
				<li key={member.id}>
					<Link
						to="/programs/$programId/members/$memberId"
						params={{ programId, memberId: member.id }}
						className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/50"
					>
						<div className="flex min-w-0 flex-col gap-1">
							<span className="truncate font-medium">{member.name}</span>
							<span className="truncate text-muted-foreground text-sm">
								{member.email}
							</span>
							<span className="flex flex-wrap gap-1.5">
								{member.wallets.map((wallet) => (
									<WalletStateBadge key={wallet.provider} {...wallet} />
								))}
							</span>
						</div>
						<span className="flex shrink-0 flex-col items-end">
							<span className="font-semibold text-lg tabular-nums">
								{member.points}
							</span>
							<span className="text-muted-foreground text-xs">points</span>
						</span>
					</Link>
				</li>
			))}
		</ul>
	);
}
