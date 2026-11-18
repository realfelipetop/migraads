PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_id_map` (
	`migration_id` text NOT NULL,
	`dest_account_id` text NOT NULL,
	`level` text NOT NULL,
	`source_id` text NOT NULL,
	`copy_index` integer DEFAULT 1 NOT NULL,
	`dest_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`migration_id`, `dest_account_id`, `level`, `source_id`, `copy_index`)
);
--> statement-breakpoint
INSERT INTO `__new_id_map`("migration_id", "dest_account_id", "level", "source_id", "copy_index", "dest_id", "created_at") SELECT '', "dest_account_id", "level", "source_id", "copy_index", "dest_id", "created_at" FROM `id_map`;--> statement-breakpoint
DROP TABLE `id_map`;--> statement-breakpoint
ALTER TABLE `__new_id_map` RENAME TO `id_map`;--> statement-breakpoint
PRAGMA foreign_keys=ON;