CREATE TABLE `push_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`job_key` text NOT NULL,
	`notify_at` integer NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`subscription_json` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`claimed_at` integer,
	`sent_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_notifications_endpoint_job_key_idx` ON `push_notifications` (`endpoint`,`job_key`);
--> statement-breakpoint
CREATE INDEX `push_notifications_due_idx` ON `push_notifications` (`status`,`next_attempt_at`);
--> statement-breakpoint
CREATE INDEX `push_notifications_endpoint_idx` ON `push_notifications` (`endpoint`);
