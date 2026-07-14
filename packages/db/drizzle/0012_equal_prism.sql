CREATE TABLE "tag_pack_catalog_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"system_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tag_packs" ADD COLUMN "collection_id" text;--> statement-breakpoint
ALTER TABLE "tag_pack_catalog_nodes" ADD CONSTRAINT "tag_pack_catalog_nodes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tag_pack_catalog_nodes_user_system_idx" ON "tag_pack_catalog_nodes" USING btree ("user_id","system_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_pack_catalog_nodes_user_parent_name_idx" ON "tag_pack_catalog_nodes" USING btree ("user_id","kind","parent_id","normalized_name");--> statement-breakpoint
INSERT INTO "tag_pack_catalog_nodes" ("user_id", "kind", "parent_id", "name", "normalized_name", "description", "system_key")
SELECT "id", 'category', NULL, 'My Packs', 'my packs', 'Your custom tag-pack catalog.', 'my-packs'
FROM "user"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "tag_pack_catalog_nodes" ("user_id", "kind", "parent_id", "name", "normalized_name", "description", "system_key")
SELECT u."id", 'collection', c."id"::text, 'Unsorted', 'unsorted', 'Custom packs that have not been organized yet.', 'unsorted-packs'
FROM "user" u
INNER JOIN "tag_pack_catalog_nodes" c ON c."user_id" = u."id" AND c."system_key" = 'my-packs'
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "tag_packs" p
SET "collection_id" = c."id"::text
FROM "tag_pack_catalog_nodes" c
WHERE c."user_id" = p."user_id" AND c."system_key" = 'unsorted-packs' AND p."collection_id" IS NULL;
