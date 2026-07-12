CREATE TABLE "project_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"document" jsonb NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "project_notes" ("project_id", "title", "document", "plain_text", "pinned")
SELECT
	"id",
	'Project Notes',
	jsonb_build_object('type', 'doc', 'content', (
		SELECT jsonb_agg(
			CASE
				WHEN "line" = '' THEN jsonb_build_object('type', 'paragraph')
				ELSE jsonb_build_object(
					'type', 'paragraph',
					'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', "line"))
				)
			END
			ORDER BY "ordinal"
		)
		FROM regexp_split_to_table("settings"->>'notes', E'\\r?\\n') WITH ORDINALITY AS "lines"("line", "ordinal")
	)),
	"settings"->>'notes',
	true
FROM "projects"
WHERE length(trim(COALESCE("settings"->>'notes', ''))) > 0;
--> statement-breakpoint
UPDATE "projects"
SET "settings" = jsonb_set("settings", '{notes}', '""'::jsonb, true)
WHERE "settings" ? 'notes';
--> statement-breakpoint
UPDATE "acts"
SET "title" = ''
WHERE trim("title") ~* '^(new act|act ([0-9]+|[ivxlcdm]+))$';
--> statement-breakpoint
UPDATE "chapters"
SET "title" = ''
WHERE trim("title") ~* '^(new chapter|chapter [0-9]+)$';
--> statement-breakpoint
UPDATE "scenes"
SET "title" = ''
WHERE trim("title") ~* '^(opening scene|new scene|untitled scene|scene [0-9]+)$';
