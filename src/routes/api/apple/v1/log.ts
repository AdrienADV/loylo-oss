import { createFileRoute } from "@tanstack/react-router";

import { logWalletMessages } from "#/features/wallet-services/apple-web-service.server";
import { readJsonBody } from "#/lib/http";

/** PassKit Web Service: Wallet reports problems with our passes here. */

export const Route = createFileRoute("/api/apple/v1/log")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				logWalletMessages(await readJsonBody(request, 64 * 1024));
				return new Response(null, { status: 200 });
			},
		},
	},
});
