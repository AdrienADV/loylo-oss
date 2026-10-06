import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { authMiddleware } from "#/features/auth/auth.middleware";
import { sendNotificationSchema } from "#/features/notifications/notifications.schemas";
import {
	NOTIFICATION_COLUMNS,
	NOTIFICATIONS_SHOWN,
	toNotificationQuota,
	toNotificationView,
} from "#/features/notifications/notifications.server";
import { programIdSchema } from "#/features/programs/programs.schemas";
import { sendProgramMessageToWallets } from "#/features/wallet-sync/wallet-sync.server";
import { getNotificationsConfig } from "#/lib/config.server";
import { createAdminClient } from "#/lib/supabase/admin-client.server";
import { databaseError } from "#/lib/supabase/errors.server";

/**
 * Marketing messages: one message reaches every pass of a program. The
 * database enforces the sending rules; these functions only report them.
 */

export const getNotificationQuota = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(programIdSchema)
	.handler(async ({ data, context }) => {
		const { data: usage, error } = await context.supabase
			.rpc("notification_usage", { program_id: data.programId })
			.single();
		if (error) {
			throw databaseError("load your messages", error);
		}
		return toNotificationQuota(usage, getNotificationsConfig().monthlyCap);
	});

/** The latest messages sent to the program's passes, newest first. */
export const listNotifications = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(programIdSchema)
	.handler(async ({ data, context }) => {
		const { data: rows, error } = await context.supabase
			.from("notifications")
			.select(NOTIFICATION_COLUMNS)
			.eq("program_id", data.programId)
			.order("created_at", { ascending: false })
			.limit(NOTIFICATIONS_SHOWN);
		if (error) {
			throw databaseError("load your messages", error);
		}
		return rows.map(toNotificationView);
	});

/**
 * Makes the message the program's current one, then shows it on every pass
 * and notifies their holders. The message is saved even when a wallet cannot
 * be reached: `walletSync` says so, and syncing the program again retries
 * (without notifying Google Wallet users twice).
 */
export const sendNotification = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(sendNotificationSchema)
	.handler(async ({ data, context }) => {
		const { data: program, error: readError } = await context.supabase
			.from("programs")
			.select("id, name, background_color, logo_path")
			.eq("id", data.programId)
			.maybeSingle();
		if (readError) {
			throw databaseError("send the message", readError);
		}
		if (!program) {
			throw notFound();
		}

		// RLS just confirmed the program is the merchant's. The cap is the
		// deployment's setting: only the server may pass it, with the admin client.
		const { monthlyCap } = getNotificationsConfig();
		const { data: notification, error } = await createAdminClient()
			.rpc("create_notification", {
				program_id: program.id,
				message: data.message,
				sent_by: context.userId,
				monthly_cap: monthlyCap,
			})
			.maybeSingle();
		if (error) {
			if (error.code === "LY001") {
				throw new Error("You can send one message every 24 hours.");
			}
			if (error.code === "LY002") {
				throw new Error(
					`You have sent all ${monthlyCap} messages allowed this month.`,
				);
			}
			throw databaseError("send the message", error);
		}
		if (!notification) {
			throw notFound();
		}

		return {
			notification: toNotificationView(notification),
			walletSync: await sendProgramMessageToWallets(context.supabase, {
				...program,
				wallet_message: notification.message,
			}),
		};
	});
