import { createFileRoute } from "@tanstack/react-router";

import {
	createApplePassFile,
	findPassByToken,
	parsePassLink,
} from "#/features/members/wallet-passes.server";
import { getOptionalAppleWalletConfig } from "#/lib/config.server";
import { textResponse } from "#/lib/http";
import { consumeRateLimit } from "#/lib/rate-limit.server";
import { createAdminClient } from "#/lib/supabase/admin-client.server";

/**
 * Pass link of an Apple Wallet pass: `?token=` must be the pass's secret.
 * Returns the signed `.pkpass`, which Safari offers to add to Wallet.
 */

export const Route = createFileRoute("/api/apple/passes/$serialNumber")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const link = parsePassLink(params.serialNumber, request);
				const config = getOptionalAppleWalletConfig();
				if (!link || !config) {
					return textResponse(404, "This link is invalid.");
				}
				if (!(await consumeRateLimit("ENROLLMENT_RATE_LIMITER", "pass"))) {
					return textResponse(429, "Too many requests. Wait a minute.");
				}

				const supabase = createAdminClient();
				const pass = await findPassByToken(supabase, "apple", link);
				if (!pass) {
					return textResponse(404, "This link is invalid.");
				}

				const file = await createApplePassFile(supabase, pass, config);
				return new Response(file, {
					headers: {
						"Content-Type": "application/vnd.apple.pkpass",
						"Content-Disposition": 'attachment; filename="loyalty-card.pkpass"',
						"Cache-Control": "no-store",
					},
				});
			},
		},
	},
});
