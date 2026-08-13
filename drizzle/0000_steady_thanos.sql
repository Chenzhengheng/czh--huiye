CREATE TABLE `portfolio_visit_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`latest_at` integer NOT NULL,
	`confirmed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_portfolio_visit_device_started` ON `portfolio_visit_sessions` (`device_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_portfolio_visit_started` ON `portfolio_visit_sessions` (`started_at`);