import { createFileRoute } from "@tanstack/react-router";

import {
	createApplePassFile,
	passContentUpdatedAt,
} from "#/features/members/wallet-passes.server";
import {
	authenticatePass,
	getWebServiceConfig,
} from "#/features/wallet-services/apple-web-service.server";
import { textResponse } from "#/lib/http";
import { createAdminClient } from "#/lib/supabase/admin-client.server";

/**
 * PassKit Web Service: Wallet downloads the latest version of a pass. Requires
 * the pass's token. `If-Modified-Since` is ignored on purpose: HTTP dates have
 * a one-second precision, so a second change within the same second (points
 * added twice) would leave Wallet with a stale pass.
 */

export const Route = createFileRoute(
	"/api/apple/v1/passes/$passTypeIdentifier/$serialNumber",
)({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const config = getWebServiceConfig(params.passTypeIdentifier);
				if (!config) {
					return textResponse(404, "Not found");
				}
				const supabase = createAdminClient();
				const pass = await authenticatePass(
					supabase,
					request,
					params.serialNumber,
				);
				if (!pass) {
					return textResponse(401, "Unauthorized");
				}

				const file = await createApplePassFile(supabase, pass, config);
				return new Response(file, {
					headers: {
						"Content-Type": "application/vnd.apple.pkpass",
						"Last-Modified": passContentUpdatedAt(pass).toUTCString(),
						"Cache-Control": "no-store",
					},
				});
			},
		},
	},
});
