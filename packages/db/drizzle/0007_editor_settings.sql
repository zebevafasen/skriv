CREATE TABLE IF NOT EXISTS "editor_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"font_family" text DEFAULT 'literary' NOT NULL,
	"font_size" integer DEFAULT 20 NOT NULL,
	"line_height" real DEFAULT 1.85 NOT NULL,
	"paragraph_spacing" real DEFAULT 1.15 NOT NULL,
	"first_line_indent" real DEFAULT 0 NOT NULL,
	"page_width" integer DEFAULT 920 NOT NULL,
	"text_align" text DEFAULT 'left' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "editor_settings" ADD CONSTRAINT "editor_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
