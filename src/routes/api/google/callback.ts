import { createFileRoute } from "@tanstack/react-router";

import { recordGoogleCallback } from "#/features/wallet-services/google-callback.server";
import { getOptionalGoogleWalletConfig } from "#/lib/config.server";
import { readJsonBody, textResponse } from "#/lib/http";
import { createAdminClient } from "#/lib/supabase/admin-client.server";
import {
	GoogleCallbackError,
	verifyGoogleCallback,
} from "#/lib/wallet/google/callback.server";

/**
 * Google Wallet calls this URL (the classes' `callbackOptions`) when a pass is
 * saved or deleted. Only callbacks signed by Google for our issuer count.
 */

export const Route = createFileRoute("/api/google/callback")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const config = getOptionalGoogleWalletConfig();
				if (!config) {
					return textResponse(404, "Not found");
				}

				let message: Awaited<ReturnType<typeof verifyGoogleCallback>>;
				try {
					message = await verifyGoogleCallback(
						await readJsonBody(request, 64 * 1024),
						{ issuerId: config.issuerId },
					);
				} catch (error) {
					// Other errors (Google's keys unavailable) answer 500: Google retries.
					if (!(error instanceof GoogleCallbackError)) {
						throw error;
					}
					console.warn(error.message);
					return textResponse(400, "Invalid callback");
				}

				await recordGoogleCallback(
					createAdminClient(),
					message,
					config.issuerId,
				);
				return new Response(null, { status: 200 });
			},
		},
	},
});
