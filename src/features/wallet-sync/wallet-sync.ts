import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "#/lib/supabase/database.types";

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

/** What every pass of a program shows about it. */
export type ProgramToSync = Pick<
	Tables<"programs">,
	"id" | "name" | "background_color" | "logo_path" | "wallet_message"
>;

/**
 * How one wallet (Apple, Google) brings the passes it holds up to date.
 * Implementations never throw: failures are logged and reported as `failed`.
 * `supabase` is the caller's client, once it has checked access to the program.
 */
export interface WalletSync {
	/** After a change to the member (their points). */
	syncMemberPasses(passes: MemberPasses): Promise<WalletSyncResult>;
	/** After a change to the program (name, color, logo): all its passes. */
	syncProgramPasses(
		supabase: SupabaseClient<Database>,
		program: ProgramToSync,
	): Promise<WalletSyncResult>;
	/** After a new `wallet_message`: shows it on all passes and notifies their holders. */
	sendProgramMessage(
		supabase: SupabaseClient<Database>,
		program: ProgramToSync,
	): Promise<WalletSyncResult>;
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
