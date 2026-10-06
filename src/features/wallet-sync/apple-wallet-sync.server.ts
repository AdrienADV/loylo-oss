import type { SupabaseClient } from "@supabase/supabase-js";

import type {
	WalletSync,
	WalletSyncResult,
} from "#/features/wallet-sync/wallet-sync";
import {
	type ApplePushConfig,
	getOptionalApplePushConfig,
} from "#/lib/config.server";
import { createAdminClient } from "#/lib/supabase/admin-client.server";
import type { Database } from "#/lib/supabase/database.types";
import { sendPassUpdatePushes } from "#/lib/wallet/apple/apns.server";

/**
 * Apple Wallet: a push tells each device holding the passes that they
 * changed, and the device downloads them again from the PassKit Web Service.
 *
 * Devices are server only, so they are read with the admin client: callers
 * check first that the passes belong to the signed-in merchant.
 */

type Supabase = SupabaseClient<Database>;

interface Registration {
	pass_id: string;
	device: { device_library_identifier: string; push_token: string };
}

/** A device that no longer accepts pushes dropped the pass: forget it. */
async function forgetRegistration(
	supabase: Supabase,
	registration: Registration,
): Promise<void> {
	const { error } = await supabase.rpc("unregister_apple_device", {
		device_library_identifier: registration.device.device_library_identifier,
		pass_id: registration.pass_id,
	});
	if (error) {
		console.error(
			"Could not forget an Apple device",
			error.code,
			error.message,
		);
	}
}

async function pushToDevices(
	supabase: Supabase,
	registrations: Registration[],
	config: ApplePushConfig,
): Promise<WalletSyncResult> {
	if (registrations.length === 0) {
		return "skipped";
	}

	let results: Awaited<ReturnType<typeof sendPassUpdatePushes>>;
	try {
		results = await sendPassUpdatePushes({
			pushTokens: registrations.map(({ device }) => device.push_token),
			passTypeId: config.passTypeId,
			credentials: config.credentials,
		});
	} catch (error) {
		// Only signing the provider token throws: the APNs key is unusable.
		console.error("Apple pushes failed", error);
		return "failed";
	}

	const unregistered = new Set(
		results
			.filter((result) => result.status === "unregistered")
			.map((result) => result.pushToken),
	);
	await Promise.all(
		registrations
			.filter(({ device }) => unregistered.has(device.push_token))
			.map((registration) => forgetRegistration(supabase, registration)),
	);

	const failures = results.flatMap((result) =>
		result.status === "failed" ? [result.reason] : [],
	);
	if (failures.length > 0) {
		console.error(
			`Apple pushes failed for ${failures.length} of ${results.length} devices`,
			failures,
		);
		return "failed";
	}
	return "synced";
}

export const appleWalletSync: WalletSync = {
	async syncMemberPasses({ passIds }) {
		const config = getOptionalApplePushConfig();
		if (!config) {
			return "skipped";
		}

		const supabase = createAdminClient();
		const { data, error } = await supabase
			.from("apple_registrations")
			.select(
				"pass_id, device:apple_devices!inner(device_library_identifier, push_token)",
			)
			.in("pass_id", passIds);
		if (error) {
			console.error(
				"Could not load the Apple devices",
				error.code,
				error.message,
			);
			return "failed";
		}
		return pushToDevices(supabase, data, config);
	},
};
