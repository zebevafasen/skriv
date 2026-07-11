UPDATE "scenes"
SET "metadata" = jsonb_set("metadata", '{labels}', '[]'::jsonb, true)
WHERE NOT ("metadata" ? 'labels');
