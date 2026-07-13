CREATE TABLE IF NOT EXISTS "project_defaults" (
	"user_id" text PRIMARY KEY NOT NULL,
	"author" text DEFAULT '' NOT NULL,
	"language" text DEFAULT 'General English' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "project_defaults" ADD CONSTRAINT "project_defaults_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tag_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"values" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tag_packs" ADD CONSTRAINT "tag_packs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tag_packs_user_name_idx" ON "tag_packs" USING btree ("user_id","normalized_name");
--> statement-breakpoint
INSERT INTO "tag_packs" ("user_id", "name", "normalized_name", "description", "values")
SELECT "user_id", "name", lower("name"), 'Migrated reusable tag collection', jsonb_build_object(
  'genres', '[]'::jsonb,
  'themes', '[]'::jsonb,
  'tags', COALESCE((SELECT jsonb_agg(value->>'definitionId') FROM jsonb_array_elements("values") value WHERE value->>'definitionId' IS NOT NULL), '[]'::jsonb)
)
FROM "user_collections"
ON CONFLICT ("user_id", "normalized_name") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compendium_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "compendium_categories" ADD CONSTRAINT "compendium_categories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "compendium_categories_project_name_idx" ON "compendium_categories" USING btree ("project_id","normalized_name");
