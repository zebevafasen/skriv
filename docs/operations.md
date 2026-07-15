# Unified operations

## Product boundaries

Web and desktop share features and archive contracts but never share a live store. PostgreSQL records remain account/workspace scoped. Desktop records remain in `%LOCALAPPDATA%\Skriv\skriv.sqlite3`. Shared UI calls only `SkrivClient`; a shared feature change must update and test both adapters.

## CI and merge gate

`Unified CI` has required `quality`, `web-e2e`, and `windows` jobs. It builds the hosted output and unsigned current-user NSIS installer without releasing either artifact. Protect `main` with these checks, the Vercel preview check, and explicit owner approval. Auto-merge stays disabled for unification.

Before the merge:

1. Apply generated additive migrations to staging PostgreSQL.
2. Deploy a preview with staging-only database, Blob, authentication, encryption, and AI secrets.
3. Install the CI desktop artifact and run the parity checklist on Windows.
4. Transfer a v5 archive desktop → web and web → desktop, including images, revisions, and Chat.
5. Verify responsive mobile browser behavior and desktop offline non-AI behavior.
6. Confirm production was untouched and obtain written approval.
7. Back up production PostgreSQL, rerun checks, and merge with a merge commit.

## Hosted migrations and archives

Deployment builds never run `drizzle push` or mutate a database. Generate migrations with `pnpm db:generate`; rehearse them with `pnpm db:migrate` against staging.

Hosted v5 archives use an environment-specific private Vercel Blob store. Import issues a 15-minute exact-path signed PUT URL; finalization validates ZIP paths, limits, checksums, and Zod content, imports in one PostgreSQL transaction with remapped identifiers, and deletes the Blob in `finally`. Export builds the same format and returns a 15-minute signed GET URL. A daily authenticated cron removes stale rows and blobs.

## Desktop recovery

The desktop database uses foreign keys, WAL, compiled migrations, and safety snapshots. Portable project snapshots are retained locally after dirty mutations and clean close. The desktop OpenRouter key is stored under service `com.zebevafasen.skriv`; hosted credentials are separately encrypted and user scoped. Credentials are excluded from archives.
