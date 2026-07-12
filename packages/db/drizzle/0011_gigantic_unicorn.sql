CREATE TABLE "project_tag_packs" (
	"project_id" uuid NOT NULL,
	"source_pack_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"ownership" text NOT NULL,
	"values" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_tag_packs_project_id_source_pack_id_pk" PRIMARY KEY("project_id","source_pack_id")
);
--> statement-breakpoint
ALTER TABLE "project_tag_packs" ADD CONSTRAINT "project_tag_packs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
