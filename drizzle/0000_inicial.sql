CREATE TABLE `accounts_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`status` integer NOT NULL,
	`currency` text NOT NULL,
	`timezone` text NOT NULL,
	`business_id` text,
	`business_name` text,
	`kind` text NOT NULL,
	`raw` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `accounts_cache_business_idx` ON `accounts_cache` (`business_id`);--> statement-breakpoint
CREATE TABLE `asset_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`dest_account_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_id` text NOT NULL,
	`dest_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_mappings_unique` ON `asset_mappings` (`dest_account_id`,`kind`,`source_id`);--> statement-breakpoint
CREATE TABLE `backup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`ad_account_id` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`frequency_hours` integer DEFAULT 24 NOT NULL,
	`scope` text DEFAULT 'active' NOT NULL,
	`include_media` integer DEFAULT false NOT NULL,
	`retention` integer DEFAULT 7 NOT NULL,
	`last_run_at` text,
	`next_run_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backup_jobs_ad_account_id_unique` ON `backup_jobs` (`ad_account_id`);--> statement-breakpoint
CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`ad_account_id` text NOT NULL,
	`status` text NOT NULL,
	`path` text,
	`stats` text,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`job_id`) REFERENCES `backup_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `backups_account_idx` ON `backups` (`ad_account_id`);--> statement-breakpoint
CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`app_id` text NOT NULL,
	`meta_user_id` text,
	`meta_user_name` text,
	`token_encrypted` text NOT NULL,
	`token_expires_at` text,
	`scopes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `id_map` (
	`dest_account_id` text NOT NULL,
	`level` text NOT NULL,
	`source_id` text NOT NULL,
	`copy_index` integer DEFAULT 1 NOT NULL,
	`dest_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`dest_account_id`, `level`, `source_id`, `copy_index`)
);
--> statement-breakpoint
CREATE TABLE `logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` text NOT NULL,
	`scope` text NOT NULL,
	`message` text NOT NULL,
	`data` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `logs_created_idx` ON `logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`source_account_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_ref` text NOT NULL,
	`local_path` text,
	`sha256` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_source_unique` ON `media` (`source_account_id`,`kind`,`source_ref`);--> statement-breakpoint
CREATE TABLE `media_copies` (
	`media_id` text NOT NULL,
	`dest_account_id` text NOT NULL,
	`dest_ref` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`media_id`, `dest_account_id`),
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `migration_items` (
	`id` text PRIMARY KEY NOT NULL,
	`migration_id` text NOT NULL,
	`snapshot_id` text,
	`level` text NOT NULL,
	`source_id` text NOT NULL,
	`copy_index` integer DEFAULT 1 NOT NULL,
	`name` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`dest_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`warnings` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`migration_id`) REFERENCES `migrations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_id`) REFERENCES `snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `migration_items_unique` ON `migration_items` (`migration_id`,`level`,`source_id`,`copy_index`);--> statement-breakpoint
CREATE TABLE `migrations` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`source_account_id` text NOT NULL,
	`dest_account_id` text,
	`options` text,
	`summary` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`started_at` text,
	`finished_at` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`source_account_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`campaign_name` text NOT NULL,
	`api_version` text NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`data` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `snapshots_account_idx` ON `snapshots` (`source_account_id`,`campaign_id`);