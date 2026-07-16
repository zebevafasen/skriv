# Operations

## Product boundaries

Web and desktop share features and archive contracts but never share a live store. PostgreSQL records remain account scoped. Desktop records remain in `%LOCALAPPDATA%\Skriv\skriv.sqlite3`. A shared feature must update and test both `SkrivClient` adapters.

## Main branch and CI

Unified CI owns the required `quality`, `web-e2e`, and `windows` checks. Protect `main` as documented in `.github/BRANCH_PROTECTION.md`. Database deployment uses generated additive migrations only: run `pnpm db:generate`, review the SQL, rehearse it against staging, then apply it with `pnpm db:migrate`. Direct schema pushes and one-off cleanup commands are intentionally unavailable.

## Archives and persistence

Schema-v5 `.skriv` archives are the current portable transfer format. Schema-v4 JSON import remains supported solely for existing exports. Desktop migrations and the historical physical ingredient-pack table names are permanent compatibility data; application APIs use current ingredient-pack terminology.

Desktop SQLite uses foreign keys, WAL, compiled migrations, safety snapshots, portable dirty-project backups, and a clean-shutdown backup. Credentials are never included in archives.

## Incident response

- For a hosted regression, stop deployment, preserve logs, restore from the production backup if data was affected, and ship a reviewed fix.
- For a desktop regression, leave the affected release available while triaging unless it is actively dangerous. Never replace artifacts under an existing version.
- Roll desktop users forward with a higher patch version; the updater rejects downgrades.
- Never request API keys or private manuscript text in issue reports or logs.
