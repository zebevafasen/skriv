# Skriv Desktop Design Specification — v5

## Product boundary

> **Unified product amendment (2026-07-14):** This specification now sits inside a two-product monorepo. The desktop boundary below remains authoritative for Tauri. The responsive hosted product adds `apps/web`, `apps/api`, PostgreSQL, Better Auth, invitations, and environment-isolated private Vercel Blob transfers. Both shells inject `SkrivClient` and fixed `PlatformCapabilities`; shared UI never probes platform globals. Their stores remain independent and schema-v5 `.skriv` archives are the only supported transfer mechanism.

Skriv is a Windows-first, single-user desktop writing environment. Human-authored project state is canonical and local. The installed application requires neither Node.js nor a database server and remains fully useful offline. OpenRouter is the only release AI provider and is contacted only for an explicit AI action.

The supported writing surface includes Projects, the continuous Scene manuscript editor, Outline and hierarchy reordering, optimistic Scene saves and revisions, Notes, Compendium, Ideation, ingredient catalogs, customizable Prompts, provisional generation acceptance/rejection, project-grounded Chat, and project import/export.

## Architecture

- `apps/desktop` owns the Vite/Tauri entry point, Rust native services, CSP/capabilities, window state, recovery startup, and Windows packaging.
- `packages/ui` owns the React writing experience and receives its application client through injection.
- `packages/application` owns the public error/client boundary and pure manuscript exporters.
- `packages/local-store` owns SQLite mappings, writing workflows, archive projection/import, AI orchestration, and automatic project backup scheduling.
- `packages/contracts`, `packages/core`, and `packages/content` own Zod contracts, pure context/prompt helpers, and bundled content.

Hosted-only identities, ownership, deployment, and PostgreSQL records remain internal to the web/API platform and are never exposed through platform-neutral project or prompt contracts. Desktop-only recovery is exposed through the nullable `BackupsClient` capability.

## Persistence model

The canonical SQLite file is `%LOCALAPPDATA%\Skriv\skriv.sqlite3`. Identifiers are text UUIDs generated before insert; timestamps are ISO-8601 text; structured values are validated JSON text; enum values are validated at the application boundary. Foreign-key cascades preserve hierarchy ownership. Scene versions and Compendium revisions are optimistic concurrency boundaries.

Application-wide tables contain preferences, AI/editor settings, prompt overrides/bindings, ingredient catalogs, and definitions. Project-owned tables contain the manuscript hierarchy, revisions, notes, Compendium, imported pack snapshots, generations, and Chat. Token counts are retained on generation and Chat records solely for local context/cost awareness; there is no usage reporting.

SQLite starts with foreign keys enabled, WAL mode, a busy timeout, and compiled migrations. Multi-step writing operations use explicit transactions, and stale optimistic updates throw before commit so preceding revision writes roll back.

## Native services and security

Rust owns SQLite access, Windows Credential Manager, OpenRouter networking, ordered channel streaming, cancellation tokens, native file dialogs, archive ZIP/checksum validation, backup file writes, controlled database restoration, and restart.

The React layer never receives the OpenRouter plaintext key. Release code has no fake provider fallback. The frontend uses bundled assets under an explicit CSP and a single narrowly scoped Tauri capability for core and window-state functionality. Dialog and opener operations remain behind purpose-built Rust commands rather than being exposed directly to the WebView. Remote frontend content is prohibited.

Window size and position persist. A close request is intercepted until pending editor saves and dirty project backups complete. Navigation inside a project flushes the editor before switching Scene or scope.

## Portable archives

Schema-v5 `.skriv` files contain a checksum manifest, a validated project payload, and cover/Compendium image assets. They include the complete manuscript, metadata, Notes, Compendium/categories, imported project packs, revisions, and Chat history. They exclude credentials, global preferences/prompts/catalogs, transient generation jobs, and telemetry.

Import validates structure and archive limits before a transaction, creates a new Project, and remaps project-owned identifiers and references. Schema-v4 JSON remains a read-only import format, including legacy Notes and singleton Compendium migration behavior.

## Backup and recovery policy

Successful project mutations mark projects dirty. A portable snapshot is created no more than once per 15 minutes while dirty, on clean close, immediately before deletion, and through the manual Settings action. Retention is the newest 10 plus one daily snapshot for 30 days.

Internal SQLite safety copies are created before migration and manually/daily, retaining seven recent and four weekly copies. Restoration is a close-copy-restart operation and preserves a pre-restore safety point. Migration failure opens a recovery screen without replacing the existing database.

## Distribution and verification

The beta target is unsigned Windows 10/11 x64, packaged as a current-user NSIS installer with the WebView2 download bootstrapper. Code signing, auto-update, Microsoft Store delivery, other desktop platforms, and mobile are explicitly deferred.

Acceptance requires TypeScript checks, Rust format/clippy/tests, SQLite migration and rollback tests, React component/editor tests, a Windows Tauri build, and WebdriverIO native E2E coverage. The installed beta must preserve all non-AI writing behavior offline and retain recoverable local data across restart.
