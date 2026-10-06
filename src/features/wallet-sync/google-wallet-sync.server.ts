import { syncGoogleLoyaltyClass } from "#/features/programs/programs.server";
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
import {
	buildProgramMessage,
	toGoogleWalletId,
} from "#/lib/wallet/google/objects";

/**
 * Google Wallet: passes show their object and its class, so updating them
 * updates the passes on every device. Object IDs are `{issuer}.{wallet pass
 * id}`, class IDs `{issuer}.{program id}`.
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

	// The class carries the program's design and message.
	syncProgramPasses: syncGoogleLoyaltyClass,

	async sendProgramMessage(supabase, program) {
		const config = getOptionalGoogleWalletConfig();
		if (!config || !program.wallet_message) {
			return "skipped";
		}

		// Google's documented way to notify holders: `addMessage` with
		// `TEXT_AND_NOTIFY`. Class updates only carry `TEXT` messages.
		try {
			await createGoogleWalletClient(
				config.serviceAccount,
			).addLoyaltyClassMessage(
				toGoogleWalletId(config.issuerId, program.id),
				buildProgramMessage(
					program.name,
					program.wallet_message,
					"TEXT_AND_NOTIFY",
				),
			);
		} catch (error) {
			// Without a class, no pass exists yet: the sync below creates it.
			if (!(error instanceof GoogleWalletApiError && error.status === 404)) {
				console.error("Google Wallet message failed", program.id, error);
				return "failed";
			}
		}
		// Replaces the class, which keeps the new message as its only one.
		return syncGoogleLoyaltyClass(supabase, program);
	},
};
