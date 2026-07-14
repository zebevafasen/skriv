# Asterism

Asterism is a private Windows desktop application for planning and writing long-form fiction. Projects, manuscript Scenes, revisions, notes, Compendium entries, ideation data, prompts, and Chat history are stored locally. No account, hosted service, Docker installation, or database server is required.

AI features are optional. They connect to OpenRouter only when you explicitly generate text, summarize a Scene, or send a Chat message. The OpenRouter key is stored in Windows Credential Manager and is never returned to the React application.

## Install the beta

The Windows x64 CI build produces an unsigned current-user NSIS installer. Windows may show a SmartScreen warning because this beta is not code-signed. The installer does not require administrator access and installs the normal WebView2 bootstrapper when necessary.

All non-AI writing features work offline after installation.

## Local data and recovery

The canonical database is:

```text
%LOCALAPPDATA%\Asterism\asterism.sqlite3
```

Asterism creates two kinds of backups beneath `%LOCALAPPDATA%\Asterism\backups`:

- Portable `.asterism` project archives after project changes, on a 15-minute maximum frequency, on clean close, and immediately before deletion. The newest 10 and one daily point for 30 days are retained.
- Internal SQLite safety snapshots before migration and for manual/daily recovery. Seven recent and four weekly points are retained.

Use **Settings → Backups** to back up immediately, open the backup folder, or restore an internal database snapshot. Export any project as a portable `.asterism` archive for independent recovery or transfer to another computer. Legacy schema-v4 JSON project exports remain importable.

Project archives never contain the OpenRouter key, global application preferences, global custom prompts/catalogs, transient generations, or telemetry.

## Development

Windows 10/11 x64 is the supported development and release platform. Install:

- Node.js 24 and pnpm 11
- stable Rust with `rustfmt` and `clippy`
- Visual Studio 2022 Build Tools with the Desktop development with C++ workload
- Microsoft Edge WebView2 Runtime

Then run:

```powershell
pnpm install
pnpm desktop:dev
```

Useful commands:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:native
pnpm desktop:check
pnpm desktop:build
pnpm desktop:e2e
```

`desktop:e2e` also requires `cargo install tauri-driver --locked`.

## Repository layout

- `apps/desktop` — Vite entry point, Tauri configuration, Rust commands, security capabilities, and NSIS packaging.
- `packages/ui` — React editor and all reusable writing surfaces.
- `packages/application` — typed application boundary and platform-neutral export logic.
- `packages/local-store` — SQLite schema, migrations, repositories/workflows, streaming orchestration, archives, and backup scheduling.
- `packages/contracts`, `packages/core`, `packages/content` — validation contracts, pure writing/context helpers, and bundled defaults.

See [desktop operations](docs/operations.md) and the [desktop design specification](Asterism_Design_Specification_v5.md) for recovery, security, and release details.
