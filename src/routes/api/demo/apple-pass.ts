import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { hexColorSchema } from "#/lib/colors";
import { getAppleWalletConfig } from "#/lib/config.server";
import { buildApplePassJson } from "#/lib/wallet/apple/pass-json";
import { createPkpass } from "#/lib/wallet/apple/pkpass.server";
import { demoImages } from "./-apple-pass-images";
import { randomHex } from "./-random-hex";

/**
 * Development-only: returns a signed demo pass to try Apple Wallet on a real
 * device, e.g. `/api/demo/apple-pass?name=Ada&points=120&color=%231d4fd7`.
 * Replaced by the real pass download in `feat/enrollment`.
 */

const demoQuerySchema = z.object({
	name: z.string().trim().min(1).max(128).default("Ada Lovelace"),
	points: z.coerce.number().int().nonnegative().default(120),
	color: hexColorSchema.default("#1d4fd7"),
	message: z.string().trim().min(1).max(100).nullable().default(null),
});

export const Route = createFileRoute("/api/demo/apple-pass")({
	server: {
		handlers: {
			GET: ({ request }) => {
				if (!import.meta.env.DEV) {
					return new Response("Not found", { status: 404 });
				}

				const query = demoQuerySchema.safeParse(
					Object.fromEntries(new URL(request.url).searchParams),
				);
				if (!query.success) {
					return Response.json(
						{ error: z.prettifyError(query.error) },
						{ status: 400 },
					);
				}

				const config = getAppleWalletConfig();
				const passJson = buildApplePassJson(
					{
						program: {
							name: "Loylo Demo",
							backgroundColor: query.data.color,
							message: query.data.message,
						},
						member: { name: query.data.name, points: query.data.points },
						pass: {
							serialNumber: randomHex(16),
							authenticationToken: randomHex(32),
						},
					},
					config,
				);
				const pkpass = createPkpass({
					passJson,
					images: demoImages,
					certificates: config.certificates,
				});

				return new Response(pkpass, {
					headers: {
						"Content-Type": "application/vnd.apple.pkpass",
						"Content-Disposition": 'attachment; filename="loylo-demo.pkpass"',
						"Cache-Control": "no-store",
					},
				});
			},
		},
	},
});
