CREATE TABLE `acts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ai_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`base_model` text DEFAULT '' NOT NULL,
	`context_model` text DEFAULT '' NOT NULL,
	`smart_context_enabled` integer DEFAULT true NOT NULL,
	`recursion_depth` integer DEFAULT 2 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_preferences` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chapters` (
	`id` text PRIMARY KEY NOT NULL,
	`act_id` text NOT NULL,
	`title` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`act_id`) REFERENCES `acts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`model` text,
	`failure_message` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text DEFAULT 'New thread' NOT NULL,
	`model` text NOT NULL,
	`context_sources` text NOT NULL,
	`rolling_summary` text DEFAULT '' NOT NULL,
	`summarized_through_message_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `compendium_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `compendium_categories_project_name_idx` ON `compendium_categories` (`project_id`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `compendium_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`type_id` text NOT NULL,
	`aliases` text NOT NULL,
	`labels` text NOT NULL,
	`image_data_url` text,
	`tracking_enabled` integer DEFAULT true NOT NULL,
	`match_exclusions` text NOT NULL,
	`activation_mode` text DEFAULT 'mention' NOT NULL,
	`case_sensitive` integer DEFAULT false NOT NULL,
	`content` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`singleton_key` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `compendium_singleton_idx` ON `compendium_entries` (`project_id`,`singleton_key`);--> statement-breakpoint
CREATE TABLE `editor_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`font_family` text DEFAULT 'literary' NOT NULL,
	`font_size` integer DEFAULT 18 NOT NULL,
	`line_height` real DEFAULT 1.85 NOT NULL,
	`paragraph_spacing` real DEFAULT 1.15 NOT NULL,
	`first_line_indent` real DEFAULT 0 NOT NULL,
	`page_width` integer DEFAULT 920 NOT NULL,
	`text_align` text DEFAULT 'left' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`parent_generation_id` text,
	`workflow` text NOT NULL,
	`model` text NOT NULL,
	`prompt_id` text NOT NULL,
	`scene_version` integer NOT NULL,
	`cursor_position` integer NOT NULL,
	`request` text NOT NULL,
	`candidate_text` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'streaming' NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`context_fallback` integer DEFAULT false NOT NULL,
	`failure_message` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ingredient_pack_catalog_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`system_key` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingredient_nodes_system_idx` ON `ingredient_pack_catalog_nodes` (`system_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `ingredient_nodes_parent_name_idx` ON `ingredient_pack_catalog_nodes` (`kind`,`parent_id`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `ingredient_packs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`collection_id` text,
	`values` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingredient_packs_name_idx` ON `ingredient_packs` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `package_settings` (
	`package_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_defaults` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`language` text DEFAULT 'General English' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_ingredient_packs` (
	`project_id` text NOT NULL,
	`source_pack_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`ownership` text NOT NULL,
	`values` text NOT NULL,
	`imported_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`project_id`, `source_pack_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`document` text NOT NULL,
	`plain_text` text DEFAULT '' NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`settings` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prompt_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`source_prompt_id` text,
	`name` text NOT NULL,
	`workflow` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`messages` text NOT NULL,
	`variables` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scene_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`version` integer NOT NULL,
	`document` text NOT NULL,
	`plain_text` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`chapter_id` text NOT NULL,
	`title` text NOT NULL,
	`position` integer NOT NULL,
	`document` text NOT NULL,
	`plain_text` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`metadata` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`values` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`normalized_label` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `definitions_kind_label_idx` ON `definitions` (`kind`,`normalized_label`);--> statement-breakpoint
CREATE TABLE `workflow_bindings` (
	`workflow` text PRIMARY KEY NOT NULL,
	`prompt_definition_id` text,
	`builtin_prompt_id` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`prompt_definition_id`) REFERENCES `prompt_definitions`(`id`) ON UPDATE no action ON DELETE set null
);
