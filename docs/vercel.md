# Vercel staging and production

Use one origin per environment so Better Auth cookies and `/api` routing remain same-origin. The checked-in `vercel.json` builds the shared web UI and bundled Fastify function in `fra1` and schedules archive cleanup.

## Isolated environments

Preview deployments require a dedicated staging PostgreSQL database and dedicated private Vercel Blob store. Scope staging `DATABASE_URL`, Blob/OIDC credentials, `BETTER_AUTH_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `CRON_SECRET`, and optional OpenRouter key to Preview only. Never expose production values to Preview or Development.

Production uses separate values scoped only to Production. Keep `DEV_AUTH_BYPASS=false` and `INVITE_ONLY=true` after the first account exists.

Required variables include:

```text
NODE_ENV=production
WEB_ORIGIN=https://ENVIRONMENT-HOST
BETTER_AUTH_URL=https://ENVIRONMENT-HOST
BETTER_AUTH_SECRET=<unique 32+ character value>
DEV_AUTH_BYPASS=false
INVITE_ONLY=true
DATABASE_URL=<environment-specific pooled PostgreSQL URL>
CREDENTIAL_ENCRYPTION_KEY=<unique 32+ character value>
CRON_SECRET=<unique 16+ character value>
AI_PROVIDER=openrouter
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=
```

Connect a private Blob store to each environment. Vercel OIDC is preferred; a scoped `BLOB_READ_WRITE_TOKEN` is supported for local/staging operations. The API issues only exact-path, exact-operation signed URLs with 15-minute expiry.

## Migrations and deployment

The Vercel build does not run migrations. Apply committed migrations deliberately:

```bash
pnpm dlx vercel@latest env run -e preview -- pnpm db:migrate
pnpm dlx vercel@latest deploy
```

Before production, create a PostgreSQL restore point or logical backup, inspect the exact migration SQL, and rehearse it on staging. The unification migration only creates `archive_transfers`; it does not drop, rename, or rewrite existing production data.

Do not promote or production-deploy `codex/unified-web-desktop` until the manual merge checklist and explicit approval are complete.
