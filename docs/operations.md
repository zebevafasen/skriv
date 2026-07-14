# Desktop operations

## Quality and release pipeline

`.github/workflows/ci.yml` runs on Windows and performs frozen dependency installation, TypeScript checks, Biome linting, unit tests, Rust formatting/clippy/tests, a Tauri/NSIS release build, and WebdriverIO desktop E2E tests. The unsigned x64 current-user NSIS installer is uploaded as the `asterism-windows-x64-beta` artifact.

No database service or server environment variables are used. Release builds contain no deterministic fake AI provider and make no background network or telemetry requests.

## Database startup and migrations

The Rust layer opens `%LOCALAPPDATA%\Asterism\asterism.sqlite3` with foreign keys, WAL journaling, normal synchronous mode, and a five-second busy timeout. SQL migrations are compiled into the binary.

Before an existing database is migrated, Asterism creates a SQLite snapshot with `VACUUM INTO`. If startup or migration fails, the normal application is not mounted. A recovery screen presents existing snapshots and the backup folder; restoring a snapshot closes the connection, copies a pre-restore safety point, replaces the database, and restarts the process.

Do not manually modify the live database. For diagnostics, first close Asterism and copy the database plus its `-wal` and `-shm` files, or use **Back up now** while the application is open.

## Project archives

`.asterism` is a ZIP archive with `manifest.json`, `project.json`, and optional `assets/` entries. The importer rejects unsupported versions, unsafe/duplicate paths, checksum or size mismatches, more than 250 MiB uncompressed content, and assets above 20 MiB. All content is validated before it is written, and import creates a new project with remapped project-owned identifiers.

When investigating a failed import, preserve the original archive. Never extract an untrusted archive over a user directory; the application reads entries in memory and does not extract paths directly.

## OpenRouter credentials and traffic

The key is stored by the Windows credential store under service `com.zebevafasen.asterism` and account `openrouter-api-key`. React receives only `configured`, `source`, and the last four characters. Key validation, model discovery, streaming completion requests, and cancellation are implemented in Rust.

Removing the credential in Settings deletes the Windows credential. Portable and internal backups do not contain it.

## Beta release checklist

1. Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm test:native`.
2. Run `pnpm desktop:build` on Windows x64.
3. Install the generated NSIS package as the current user on a clean Windows 10 or 11 VM.
4. Verify offline project creation/edit/restart, v4 import, v5 round trip, backup creation/restore, missing-key guidance, AI cancellation, and uninstall behavior.
5. Record the installer SHA-256 alongside the beta release artifact.
