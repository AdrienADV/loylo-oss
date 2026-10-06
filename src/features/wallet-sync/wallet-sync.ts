/**
 * Keeping passes up to date in customers' wallets. A change commits to the
 * database first, then each wallet is synced. A sync sends the current state,
 * so it never fails the change and running it again retries it.
 */

export type WalletSyncResult = "synced" | "skipped" | "failed";

/** A member's passes in one wallet, and the points they show. */
export interface MemberPasses {
	points: number;
	passIds: string[];
}

/**
 * How one wallet (Apple, Google) brings the passes it holds up to date.
 * Implementations never throw: failures are logged and reported as `failed`.
 */
export interface WalletSync {
	/** After a change to the member (their points). */
	syncMemberPasses(passes: MemberPasses): Promise<WalletSyncResult>;
}

/** `failed` if any failed, else `synced` if any synced, else `skipped`. */
export function combineSyncResults(
	results: WalletSyncResult[],
): WalletSyncResult {
	if (results.includes("failed")) {
		return "failed";
	}
	return results.includes("synced") ? "synced" : "skipped";
}
