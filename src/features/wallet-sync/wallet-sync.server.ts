import type { SupabaseClient } from "@supabase/supabase-js";

import {
	WALLET_PROVIDERS,
	type WalletProvider,
} from "#/features/members/members.schemas";
import { appleWalletSync } from "#/features/wallet-sync/apple-wallet-sync.server";
import { googleWalletSync } from "#/features/wallet-sync/google-wallet-sync.server";
import {
	combineSyncResults,
	type MemberPasses,
	type WalletSync,
	type WalletSyncResult,
} from "#/features/wallet-sync/wallet-sync";
import type { Database } from "#/lib/supabase/database.types";

const WALLET_SYNCS: Record<WalletProvider, WalletSync> = {
	apple: appleWalletSync,
	google: googleWalletSync,
};

async function syncWallet(
	provider: WalletProvider,
	passes: MemberPasses,
): Promise<WalletSyncResult> {
	if (passes.passIds.length === 0) {
		return "skipped";
	}
	try {
		return await WALLET_SYNCS[provider].syncMemberPasses(passes);
	} catch (error) {
		// A wallet's configuration may be invalid: the change is saved anyway.
		console.error(`Could not sync the ${provider} passes`, error);
		return "failed";
	}
}

/**
 * Brings every pass of the member up to date in its wallet, with the
 * member's current points. `supabase` is the merchant's client: Row Level
 * Security confirms the member is theirs before any wallet is reached.
 * Returns `null` for an unknown or foreign member.
 */
export async function syncMemberWallets(
	supabase: SupabaseClient<Database>,
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

	const results = await Promise.all(
		WALLET_PROVIDERS.map((provider) =>
			syncWallet(provider, {
				points: member.points,
				passIds: member.wallet_passes
					.filter((pass) => pass.provider === provider)
					.map((pass) => pass.id),
			}),
		),
	);
	return combineSyncResults(results);
}
