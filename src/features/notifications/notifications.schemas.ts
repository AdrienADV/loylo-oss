import { z } from "zod";

/** Same limit as the database: Apple shows it on the pass, Google in its messages. */
export const MAX_MESSAGE_LENGTH = 100;

export const notificationFieldsSchema = z.object({
	message: z
		.string()
		.trim()
		.min(1, "Write a message.")
		.max(MAX_MESSAGE_LENGTH, `Use at most ${MAX_MESSAGE_LENGTH} characters.`),
});

export type NotificationFields = z.output<typeof notificationFieldsSchema>;

export const sendNotificationSchema = notificationFieldsSchema.extend({
	programId: z.uuid(),
});
