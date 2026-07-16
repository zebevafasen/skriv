# Skriv

Skriv is developed as two independent writing products from one shared codebase:

- **Web** is a responsive hosted private beta with accounts, invitations, PostgreSQL, encrypted per-user OpenRouter credentials, and Vercel deployment.
- **Desktop** is a Windows-first Tauri application with no accounts, local SQLite storage, Windows Credential Manager, native file dialogs, and automatic local backups.
- **Shared** packages contain the editor, writing UI, contracts, prompts, context logic, application client, archive codec, and manuscript exporters.

The two stores do not synchronize. A checksummed schema-v5 `.skriv` archive is the deliberate project-transfer format. Both products import and export it; legacy schema-v4 JSON is import-only.

## Development

Install Node.js 24 and pnpm 11. Hosted development also needs Docker; desktop development needs stable Rust, Visual Studio C++ Build Tools, and WebView2.

```powershell
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm web:dev
```

Desktop development uses `pnpm desktop:dev`.

## Windows desktop release

Desktop releases are distributed as Windows x64 installers through GitHub Releases. Non-AI writing works offline; installation may still require internet access when Windows needs to install WebView2. AI features connect directly to OpenRouter after the user adds an API key in Settings.

Projects are stored locally under `%LOCALAPPDATA%\Skriv`. Packaged production builds check the signed stable GitHub release channel after startup; downloads and installation always require user approval. Existing 0.1.3 installations need one final manual installer upgrade before automatic updates are available. Before releasing, review the [desktop release guide](docs/desktop-release.md), [privacy notice](PRIVACY.md), and [changelog](CHANGELOG.md).

Skriv is proprietary during alpha and is not open-source software. Official alpha binaries may be used for personal, non-commercial evaluation; the source code is available for inspection only. See [LICENSE](LICENSE) for the complete terms.

Common verification commands:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm build:vercel
pnpm web:e2e
pnpm test:native
pnpm desktop:build
pnpm desktop:e2e
pnpm desktop:release-check
pnpm test:compatibility
```

## Repository layout

- `apps/web` — Vite shell, authenticated HTTP/NDJSON client, login, invitations, and browser file transfer.
- `apps/api` — Fastify, Better Auth, ownership isolation, hosted AI orchestration, archive transfers, and Vercel handler.
- `apps/desktop` — Vite/Tauri shell, Rust native services, security capabilities, and NSIS packaging.
- `packages/ui` — shared React writing experience.
- `packages/application` — typed client boundary, archive codec, workflows, and exporters.
- `packages/db` — PostgreSQL schema and generated hosted migrations.
- `packages/local-store` — SQLite desktop implementation and local backup scheduling.
- `packages/contracts`, `packages/core`, `packages/content`, `packages/ai` — platform-neutral schemas and writing logic.

## Release safety

`main` is protected by the `quality`, `web-e2e`, and `windows` jobs in Unified CI. Desktop releases are created only by manually dispatching the Desktop Release workflow from `main`; it creates a draft release that must pass the Windows smoke-test checklist before publication. Updater signing is mandatory, while Authenticode is optional but strongly recommended.

See [operations](docs/operations.md), [Vercel deployment](docs/vercel.md), and the [design specification](Skriv_Design_Specification_v5.md).
