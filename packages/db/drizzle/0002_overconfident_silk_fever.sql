ALTER TYPE "public"."activation_mode" ADD VALUE 'smart';--> statement-breakpoint
ALTER TABLE "compendium_entries" ADD COLUMN "labels" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "compendium_entries" ADD COLUMN "image_data_url" text;--> statement-breakpoint
ALTER TABLE "compendium_entries" ADD COLUMN "tracking_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "compendium_entries" ADD COLUMN "match_exclusions" jsonb DEFAULT '[]'::jsonb NOT NULL;