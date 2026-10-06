import { createFileRoute } from "@tanstack/react-router";

import {
	authenticatePass,
	deviceLibraryIdentifierSchema,
	getWebServiceConfig,
	registerDevice,
	registrationBodySchema,
	unregisterDevice,
} from "#/features/wallet-services/apple-web-service.server";
import { readJsonBody, textResponse } from "#/lib/http";
import { createAdminClient } from "#/lib/supabase/admin-client.server";

/**
 * PassKit Web Service: Wallet registers a device for a pass when it is added
 * (201, or 200 when already registered) and unregisters it when it is
 * removed. Both require the pass's token.
 */

export const Route = createFileRoute(
	"/api/apple/v1/devices/$deviceLibraryIdentifier/registrations/$passTypeIdentifier/$serialNumber",
)({
	server: {
		handlers: {
			POST: async ({ request, params }) => {
				const device = deviceLibraryIdentifierSchema.safeParse(
					params.deviceLibraryIdentifier,
				);
				if (
					!getWebServiceConfig(params.passTypeIdentifier) ||
					!device.success
				) {
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
				const body = registrationBodySchema.safeParse(
					await readJsonBody(request, 4096),
				);
				if (!body.success) {
					return textResponse(400, "Expected a push token");
				}

				const created = await registerDevice(supabase, {
					deviceLibraryIdentifier: device.data,
					pushToken: body.data.pushToken,
					passId: pass.id,
				});
				return new Response(null, { status: created ? 201 : 200 });
			},

			DELETE: async ({ request, params }) => {
				const device = deviceLibraryIdentifierSchema.safeParse(
					params.deviceLibraryIdentifier,
				);
				if (
					!getWebServiceConfig(params.passTypeIdentifier) ||
					!device.success
				) {
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

				await unregisterDevice(supabase, {
					deviceLibraryIdentifier: device.data,
					passId: pass.id,
				});
				return new Response(null, { status: 200 });
			},
		},
	},
});
