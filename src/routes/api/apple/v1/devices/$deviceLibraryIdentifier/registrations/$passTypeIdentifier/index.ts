import { createFileRoute } from "@tanstack/react-router";

import {
	deviceLibraryIdentifierSchema,
	getWebServiceConfig,
	listUpdatedPasses,
} from "#/features/wallet-services/apple-web-service.server";
import { textResponse } from "#/lib/http";
import { createAdminClient } from "#/lib/supabase/admin-client.server";

/**
 * PassKit Web Service: after a push, Wallet asks which of the device's passes
 * changed since the `lastUpdated` tag it got last time (204 when none did).
 * Apple sends no token here: the device library identifier is the secret.
 */

export const Route = createFileRoute(
	"/api/apple/v1/devices/$deviceLibraryIdentifier/registrations/$passTypeIdentifier/",
)({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const device = deviceLibraryIdentifierSchema.safeParse(
					params.deviceLibraryIdentifier,
				);
				if (
					!getWebServiceConfig(params.passTypeIdentifier) ||
					!device.success
				) {
					return textResponse(404, "Not found");
				}

				const updated = await listUpdatedPasses(
					createAdminClient(),
					device.data,
					new URL(request.url).searchParams.get("passesUpdatedSince"),
				);
				if (!updated) {
					return new Response(null, { status: 204 });
				}
				return Response.json(updated, {
					headers: { "Cache-Control": "no-store" },
				});
			},
		},
	},
});
