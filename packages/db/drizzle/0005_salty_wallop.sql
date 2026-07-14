-- Chat tables were introduced by 0004_project_chat. The original generated
-- migration duplicated those tables, preventing a clean migration chain.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;
