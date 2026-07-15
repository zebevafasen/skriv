UPDATE "ai_settings" SET "base_model" = 'skriv/fake-prose' WHERE "base_model" = 'asterism/fake-prose';--> statement-breakpoint
UPDATE "ai_settings" SET "context_model" = 'skriv/fake-context' WHERE "context_model" = 'asterism/fake-context';--> statement-breakpoint
ALTER TABLE "ai_settings" ALTER COLUMN "base_model" SET DEFAULT 'skriv/fake-prose';--> statement-breakpoint
ALTER TABLE "ai_settings" ALTER COLUMN "context_model" SET DEFAULT 'skriv/fake-context';
