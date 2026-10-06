import type { SupabaseClient } from "@supabase/supabase-js";

import {
	WALLET_PROVIDERS,
	type WalletProvider,
} from "#/features/members/members.schemas";
import { appleWalletSync } from "#/features/wallet-sync/apple-wallet-sync.server";
import { googleWalletSync } from "#/features/wallet-sync/google-wallet-sync.server";
import {
	combineSyncResults,
	type ProgramToSync,
	type WalletSync,
	type WalletSyncResult,
} from "#/features/wallet-sync/wallet-sync";
import type { Database } from "#/lib/supabase/database.types";

type Supabase = SupabaseClient<Database>;

const WALLET_SYNCS: Record<WalletProvider, WalletSync> = {
	apple: appleWalletSync,
	google: googleWalletSync,
};

/** Runs `sync` for each wallet; a wallet that throws counts as `failed`. */
async function syncEachWallet(
	sync: (
		wallet: WalletSync,
		provider: WalletProvider,
	) => Promise<WalletSyncResult>,
): Promise<WalletSyncResult> {
	const results = await Promise.all(
		WALLET_PROVIDERS.map(async (provider) => {
			try {
				return await sync(WALLET_SYNCS[provider], provider);
			} catch (error) {
				// A wallet's configuration may be invalid: the change is saved anyway.
				console.error(`Could not sync the ${provider} passes`, error);
				return "failed" as const;
			}
		}),
	);
	return combineSyncResults(results);
}

/**
 * Brings every pass of the member up to date in its wallet, with the
 * member's current points. `supabase` is the merchant's client: Row Level
 * Security confirms the member is theirs before any wallet is reached.
 * Returns `null` for an unknown or foreign member.
 */
export async function syncMemberWallets(
	supabase: Supabase,
	memberId: string,
): Promise<WalletSyncResult | null> {
	const { data: member, error } = await supabase
		.from("members")
		.select("points, wallet_passes(id, provider)")
		.eq("id", memberId)
		.maybeSingle();
	if (error) {
		console.error(
			"Could not load the passes to sync",
			error.code,
			error.message,
		);
		return "failed";
	}
	if (!member) {
		return null;
	}

	return syncEachWallet((wallet, provider) => {
		const passIds = member.wallet_passes
			.filter((pass) => pass.provider === provider)
			.map((pass) => pass.id);
		return passIds.length === 0
			? Promise.resolve("skipped")
			: wallet.syncMemberPasses({ points: member.points, passIds });
	});
}

/**
 * Brings every pass of the program up to date after a change to its name,
 * color or logo. `supabase` is the merchant's client, and `program` a row it
 * could read.
 */
export function syncProgramWallets(
	supabase: Supabase,
	program: ProgramToSync,
): Promise<WalletSyncResult> {
	return syncEachWallet((wallet) =>
		wallet.syncProgramPasses(supabase, program),
	);
}

/** Shows the program's new message on every pass and notifies their holders. */
export function sendProgramMessageToWallets(
	supabase: Supabase,
	program: ProgramToSync,
): Promise<WalletSyncResult> {
	return syncEachWallet((wallet) =>
		wallet.sendProgramMessage(supabase, program),
	);
}
