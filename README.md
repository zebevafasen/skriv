# Asterism

Asterism is developed as two independent writing products from one shared codebase:

- **Web** is a responsive hosted private beta with accounts, invitations, PostgreSQL, encrypted per-user OpenRouter credentials, and Vercel deployment.
- **Desktop** is a Windows-first Tauri application with no accounts, local SQLite storage, Windows Credential Manager, native file dialogs, and automatic local backups.
- **Shared** packages contain the editor, writing UI, contracts, prompts, context logic, application client, archive codec, and manuscript exporters.

The two stores do not synchronize. A checksummed schema-v5 `.asterism` archive is the deliberate project-transfer format. Both products import and export it; legacy schema-v4 JSON is import-only.

## Development

Install Node.js 24 and pnpm 11. Hosted development also needs Docker; desktop development needs stable Rust, Visual Studio C++ Build Tools, and WebView2.

```powershell
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm web:dev
```

Desktop development uses `pnpm desktop:dev`.

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

`main` remains the production web baseline until the integration branch passes Unified CI, produces a staging Vercel preview and Windows installer, completes the manual parity/archive checklist, and receives explicit written approval. Auto-merge is not permitted. The final integration must use one merge commit after a production PostgreSQL backup.

See [operations](docs/operations.md), [Vercel deployment](docs/vercel.md), and the [design specification](Asterism_Design_Specification_v5.md).
