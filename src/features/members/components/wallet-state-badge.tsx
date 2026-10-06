import type { WalletProvider } from "#/features/members/members.schemas";
import type { PassInstallState } from "#/features/members/members.server";
import { cn } from "@/lib/utils";

export const WALLET_NAMES: Record<WalletProvider, string> = {
	apple: "Apple Wallet",
	google: "Google Wallet",
};

export const INSTALL_STATE_LABELS: Record<PassInstallState, string> = {
	installed: "In wallet",
	removed: "Removed",
	"not-added": "Not added yet",
};

const DOT_CLASSES: Record<PassInstallState, string> = {
	installed: "bg-emerald-500",
	removed: "bg-amber-500",
	"not-added": "bg-muted-foreground/40",
};

/** Whether a member's card is in their Apple or Google wallet. */
export function WalletStateBadge({
	provider,
	state,
}: {
	provider: WalletProvider;
	state: PassInstallState;
}) {
	return (
		<span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs">
			<span
				aria-hidden
				className={cn("size-1.5 rounded-full", DOT_CLASSES[state])}
			/>
			{WALLET_NAMES[provider]} · {INSTALL_STATE_LABELS[state]}
		</span>
	);
}
