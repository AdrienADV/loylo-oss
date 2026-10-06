import type { Tables } from "#/lib/supabase/database.types";

/** What the merchant's pages receive about messages and the sending rules. */

/** The history shows the latest messages: with the monthly cap, about a year. */
export const NOTIFICATIONS_SHOWN = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface NotificationQuota {
	monthlyCap: number;
	sentThisMonth: number;
	/** When the next message can be sent, or `null` if it can be sent now. */
	availableAt: string | null;
}

/**
 * The rules `create_notification` enforces, for display: one message per
 * 24 hours, at most `monthlyCap` per calendar month (UTC).
 */
export function toNotificationQuota(
	usage: { sent_this_month: number; last_sent_at: string | null },
	monthlyCap: number,
	now = new Date(),
): NotificationQuota {
	const waits: number[] = [];
	if (usage.last_sent_at) {
		const nextDay = Date.parse(usage.last_sent_at) + DAY_MS;
		if (nextDay > now.getTime()) {
			waits.push(nextDay);
		}
	}
	if (usage.sent_this_month >= monthlyCap) {
		waits.push(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
	}
	return {
		monthlyCap,
		sentThisMonth: usage.sent_this_month,
		availableAt:
			waits.length > 0 ? new Date(Math.max(...waits)).toISOString() : null,
	};
}

export const NOTIFICATION_COLUMNS = "id, message, created_at" as const;

export interface NotificationView {
	id: number;
	message: string;
	createdAt: string;
}

export function toNotificationView(
	row: Pick<Tables<"notifications">, "id" | "message" | "created_at">,
): NotificationView {
	return { id: row.id, message: row.message, createdAt: row.created_at };
}
