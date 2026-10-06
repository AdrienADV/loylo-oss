import { createFileRoute } from "@tanstack/react-router";

import {
	createGoogleSaveUrl,
	findPassByToken,
	parsePassLink,
} from "#/features/members/wallet-passes.server";
import { getOptionalGoogleWalletConfig } from "#/lib/config.server";
import { textResponse } from "#/lib/http";
import { consumeRateLimit } from "#/lib/rate-limit.server";
import { createAdminClient } from "#/lib/supabase/admin-client.server";

/**
 * Pass link of a Google Wallet pass: `?token=` must be the pass's secret.
 * Brings the Google object up to date, then redirects to its save link.
 */

export const Route = createFileRoute("/api/google/passes/$serialNumber")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const link = parsePassLink(params.serialNumber, request);
				const config = getOptionalGoogleWalletConfig();
				if (!link || !config) {
					return textResponse(404, "This link is invalid.");
				}
				if (!(await consumeRateLimit("ENROLLMENT_RATE_LIMITER", "pass"))) {
					return textResponse(429, "Too many requests. Wait a minute.");
				}

				const supabase = createAdminClient();
				const pass = await findPassByToken(supabase, "google", link);
				if (!pass) {
					return textResponse(404, "This link is invalid.");
				}

				let saveUrl: string;
				try {
					saveUrl = await createGoogleSaveUrl(supabase, pass, config);
				} catch (error) {
					console.error(
						"Google Wallet pass preparation failed",
						pass.id,
						error,
					);
					return textResponse(
						503,
						"Google Wallet is unavailable right now. Reload this page in a moment.",
					);
				}
				return new Response(null, {
					status: 303,
					headers: { Location: saveUrl, "Cache-Control": "no-store" },
				});
			},
		},
	},
});
