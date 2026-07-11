# Private-beta operations

## Continuous integration

`.github/workflows/ci.yml` is the merge-quality baseline. Its quality job runs frozen installation, typecheck, Biome validation, unit tests, and the production build. Its E2E job starts clean PostgreSQL, applies every committed migration, and runs Playwright in Chromium. Configure both jobs as required branch-protection checks.

## Environment separation

For personal use, deploy the repository as one Vercel project so the Vite frontend, Fastify API,
authentication cookies, and `/api` routes share one origin. Use a Neon database in the same region
as the Vercel Function. See [Personal Vercel deployment](vercel.md) for the exact setup.

For a future multi-user beta, use separate Neon databases for preview and production. Preview
deployments must not share the production database.

Required production variables:

```text
NODE_ENV=production
WEB_ORIGIN=https://your-web-host
DATABASE_URL=postgresql://...
BETTER_AUTH_URL=https://your-web-host
BETTER_AUTH_SECRET=<at least 32 high-entropy characters>
DEV_AUTH_BYPASS=false
INVITE_ONLY=true
CREDENTIAL_ENCRYPTION_KEY=<a separate high-entropy secret>
AI_PROVIDER=fake
```

## Release checklist

1. Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`.
2. Apply migrations to the preview database and complete the manuscript-generation smoke test.
3. Confirm that registration without an invitation returns 403.
4. Confirm that two beta accounts cannot read each other's Projects.
5. Verify streamed generation, cancellation, acceptance, restore history, and export.
6. Apply migrations to production before deploying the API.

## Backup and restore

- Enable the hosted PostgreSQL provider's point-in-time recovery before inviting testers.
- Take a logical `pg_dump` before every production migration.
- Test restoration into a separate database; do not test by overwriting production.
- Retain exported Projects separately from database backups when a tester requests a portable copy.
- After restoration, run migration status checks and verify Scene versions, Compendium entry revisions, Prompt bindings, and authentication sessions.

Example logical backup:

```bash
pg_dump --format=custom --no-owner --file=asterism.dump "$DATABASE_URL"
```

Example restoration into an empty verification database:

```bash
pg_restore --clean --if-exists --no-owner --dbname="$RESTORE_DATABASE_URL" asterism.dump
```

## Serverless portability

The API owns provider and NDJSON stream normalization behind framework-neutral contracts. If hosted generation duration exceeds the selected serverless limits, move only `apps/api` to a long-running Node host and update the web API origin; the database, browser contracts, and provider adapters do not need redesign.
