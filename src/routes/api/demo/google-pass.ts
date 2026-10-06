import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { hexColorSchema } from "#/lib/colors";
import { getGoogleWalletConfig } from "#/lib/config.server";
import {
	createGoogleWalletClient,
	GoogleWalletApiError,
} from "#/lib/wallet/google/client.server";
import {
	buildLoyaltyClass,
	buildLoyaltyObject,
	toGoogleWalletId,
} from "#/lib/wallet/google/objects";
import { randomHex } from "./-random-hex";

/**
 * Development-only: tries the Google Wallet adapter against the real API.
 *
 * - `GET /api/demo/google-pass?name=Ada&points=120&color=%231d4fd7` creates
 *   the demo class and a demo pass, and returns the "Save to Google Wallet" link.
 * - `POST /api/demo/google-pass?objectId=…&points=250` updates the points.
 * - `POST /api/demo/google-pass?message=Hello` notifies every demo pass holder.
 *
 * Replaced by the real flows in `feat/enrollment`, `feat/points` and
 * `feat/marketing-notifications`.
 */

const DEMO_CLASS_SUFFIX = "loylo-demo";
// Public sample image from Google's Wallet REST samples.
const DEMO_LOGO_URL =
	"https://farm8.staticflickr.com/7340/11177041185_a61a7f2139_o.jpg";

const createQuerySchema = z.object({
	name: z.string().trim().min(1).max(128).default("Ada Lovelace"),
	points: z.coerce.number().int().nonnegative().default(120),
	color: hexColorSchema.default("#1d4fd7"),
	logoUrl: z.url({ protocol: /^https$/ }).default(DEMO_LOGO_URL),
});

const updateQuerySchema = z.union([
	z.object({
		objectId: z.string().min(1),
		points: z.coerce.number().int().nonnegative(),
	}),
	z.object({ message: z.string().trim().min(1).max(100) }),
]);

function searchParams(request: Request) {
	return Object.fromEntries(new URL(request.url).searchParams);
}

async function runDemo(action: () => Promise<Response>): Promise<Response> {
	if (!import.meta.env.DEV) {
		return new Response("Not found", { status: 404 });
	}
	try {
		return await action();
	} catch (error) {
		if (error instanceof z.ZodError) {
			return Response.json({ error: z.prettifyError(error) }, { status: 400 });
		}
		if (error instanceof GoogleWalletApiError) {
			return Response.json({ error: error.message }, { status: 502 });
		}
		throw error;
	}
}

export const Route = createFileRoute("/api/demo/google-pass")({
	server: {
		handlers: {
			GET: ({ request }) =>
				runDemo(async () => {
					const query = createQuerySchema.parse(searchParams(request));
					const config = getGoogleWalletConfig();
					const client = createGoogleWalletClient(config.serviceAccount);

					await client.upsertLoyaltyClass(
						buildLoyaltyClass(
							{
								classSuffix: DEMO_CLASS_SUFFIX,
								programName: "Loylo Demo",
								backgroundColor: query.color,
								logoUrl: query.logoUrl,
							},
							config,
						),
					);

					const serialNumber = randomHex(16);
					const loyaltyObject = buildLoyaltyObject(
						{
							classSuffix: DEMO_CLASS_SUFFIX,
							objectSuffix: serialNumber,
							serialNumber,
							memberName: query.name,
							points: query.points,
						},
						config,
					);
					await client.upsertLoyaltyObject(loyaltyObject);

					const saveUrl = await client.createSaveUrl({
						objectIds: [loyaltyObject.id],
						origins: config.origins,
					});
					return Response.json({ objectId: loyaltyObject.id, saveUrl });
				}),

			POST: ({ request }) =>
				runDemo(async () => {
					const query = updateQuerySchema.parse(searchParams(request));
					const config = getGoogleWalletConfig();
					const client = createGoogleWalletClient(config.serviceAccount);

					if ("message" in query) {
						await client.addLoyaltyClassMessage(
							toGoogleWalletId(config.issuerId, DEMO_CLASS_SUFFIX),
							{ header: "Loylo Demo", body: query.message },
						);
					} else {
						await client.setLoyaltyPoints(query.objectId, query.points);
					}
					return new Response(null, { status: 204 });
				}),
		},
	},
});
