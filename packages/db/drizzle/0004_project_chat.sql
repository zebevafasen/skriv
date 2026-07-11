CREATE TABLE "chat_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "title" text DEFAULT 'New thread' NOT NULL,
  "model" text NOT NULL,
  "context_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "rolling_summary" text DEFAULT '' NOT NULL,
  "summarized_through_message_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "thread_id" uuid NOT NULL REFERENCES "chat_threads"("id") ON DELETE cascade,
  "role" text NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'completed' NOT NULL,
  "model" text,
  "failure_message" text,
  "input_tokens" integer,
  "output_tokens" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
