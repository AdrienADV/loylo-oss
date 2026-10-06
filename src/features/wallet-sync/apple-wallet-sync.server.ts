import type { SupabaseClient } from "@supabase/supabase-js";

import type {
	ProgramToSync,
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

/** The Data API returns at most this many rows per request (`max_rows`). */
const DEVICES_PAGE_SIZE = 1000;

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

/** Every registration of the program's passes, a page of devices at a time. */
async function listProgramRegistrations(
	supabase: Supabase,
	programId: string,
): Promise<Registration[] | null> {
	const registrations: Registration[] = [];
	for (let from = 0; ; from += DEVICES_PAGE_SIZE) {
		const { data, error } = await supabase
			.rpc("list_program_apple_devices", { program_id: programId })
			.range(from, from + DEVICES_PAGE_SIZE - 1);
		if (error) {
			console.error(
				"Could not load the program's Apple devices",
				error.code,
				error.message,
			);
			return null;
		}
		for (const { pass_ids, ...device } of data) {
			for (const passId of pass_ids) {
				registrations.push({ pass_id: passId, device });
			}
		}
		if (data.length < DEVICES_PAGE_SIZE) {
			return registrations;
		}
	}
}

/**
 * Pushes every device holding a pass of the program. Each push is one
 * request: a Worker's subrequest limit bounds how many devices one call reaches.
 */
async function syncProgramPasses(
	_supabase: Supabase,
	program: ProgramToSync,
): Promise<WalletSyncResult> {
	const config = getOptionalApplePushConfig();
	if (!config) {
		return "skipped";
	}

	const supabase = createAdminClient();
	const registrations = await listProgramRegistrations(supabase, program.id);
	if (!registrations) {
		return "failed";
	}
	return pushToDevices(supabase, registrations, config);
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

	syncProgramPasses,

	// The pass's message field has a change message: when a device downloads
	// the pass with the new message, Wallet shows it as a notification.
	sendProgramMessage: syncProgramPasses,
};
