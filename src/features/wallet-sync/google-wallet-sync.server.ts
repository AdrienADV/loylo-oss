import {
	combineSyncResults,
	type WalletSync,
	type WalletSyncResult,
} from "#/features/wallet-sync/wallet-sync";
import { getOptionalGoogleWalletConfig } from "#/lib/config.server";
import {
	createGoogleWalletClient,
	GoogleWalletApiError,
} from "#/lib/wallet/google/client.server";
import { toGoogleWalletId } from "#/lib/wallet/google/objects";

/**
 * Google Wallet: passes show their object, so updating the object updates
 * the pass on every device. Object IDs are `{issuer}.{wallet pass id}`.
 */
export const googleWalletSync: WalletSync = {
	async syncMemberPasses({ points, passIds }) {
		const config = getOptionalGoogleWalletConfig();
		if (!config) {
			return "skipped";
		}

		const client = createGoogleWalletClient(config.serviceAccount);
		const results = await Promise.all(
			passIds.map(async (passId): Promise<WalletSyncResult> => {
				try {
					await client.setLoyaltyPoints(
						toGoogleWalletId(config.issuerId, passId),
						points,
					);
					return "synced";
				} catch (error) {
					// The object is created, with the current points, when the
					// pass link is first opened: until then there is nothing to update.
					if (error instanceof GoogleWalletApiError && error.status === 404) {
						return "skipped";
					}
					console.error("Google Wallet points update failed", passId, error);
					return "failed";
				}
			}),
		);
		return combineSyncResults(results);
	},
};
