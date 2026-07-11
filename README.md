# Asterism

Asterism is a full-stack, AI-assisted long-form fiction workspace. It combines a continuous Scene-based manuscript editor, a draggable planning Outline, streamed prose generation, AI-assisted Scene summaries, a navigable Compendium, grounded Smart Context, editable workflow prompts, and story ideation.

## Prerequisites

Before starting, make sure you have installed:
1. **[Node.js 24 LTS](https://nodejs.org/)**: This is required to run the JavaScript code.
2. **[Docker Desktop](https://www.docker.com/products/docker-desktop/)**: Docker is a tool that lets this app run its own isolated database without you having to manually install or configure a database server on your computer. You must have Docker Desktop installed, and you must actually **open the Docker Desktop application** and let it run in the background on your computer before continuing.

*Note: You don't need to install `pnpm` manually, the setup steps below will handle that for you using Node's built-in `corepack`.*

## Step-by-Step Local Setup

Open your terminal (or Command Prompt) in the project folder and run the following commands in order:

1. **Enable the package manager** (this allows you to use the `pnpm` command):
   ```bash
   corepack enable
   ```

2. **Install all the necessary project files and dependencies**:
   ```bash
   pnpm install
   ```

3. **Create your local configuration file**:
   *(Note: You only need to run this command the very first time you set up the project. Do not run it again later or it will overwrite your saved settings!)*
   ```bash
   copy .env.example .env
   ```

4. **Start the database** (this uses Docker, so make sure the Docker Desktop app is currently open and running!):
   ```bash
   pnpm infra:up
   ```

5. **Set up the database structure** (this creates the necessary tables):
   ```bash
   pnpm db:migrate
   ```

6. **Start the app!**
   ```bash
   pnpm dev
   ```

Once you see a message saying the server is ready, open your web browser and go to `http://localhost:5173`. 

### Setting up the AI

By default, the app uses a "fake" AI that just replies with dummy text so you can test the app without an API key. 

To use real AI features:
1. Create an account on [OpenRouter](https://openrouter.ai/) and generate an API Key.
2. Open Asterism and choose **Settings** in the main navigation.
3. Paste the key into **OpenRouter API key** and choose **Save key**. Asterism validates the key before saving it.
4. Choose the OpenRouter models you want for writing and Smart Context, then save the AI settings.

The key is encrypted in PostgreSQL with `CREDENTIAL_ENCRYPTION_KEY`; the plaintext is never returned to the browser. Set that environment value to a private random secret in hosted environments. `OPENROUTER_API_KEY` remains available as a server-wide fallback for deployments that do not want per-user keys.

## Commands

```bash
pnpm dev          # Run web and API with hot reload
pnpm typecheck    # Strict TypeScript validation
pnpm lint         # Biome lint and formatting check
pnpm test         # Deterministic unit tests
pnpm test:e2e     # Playwright private-beta workflow
pnpm build        # Production builds
pnpm db:generate  # Generate a migration after schema changes
pnpm db:migrate   # Apply committed migrations
pnpm infra:down   # Stop local infrastructure
```

## Repository layout

- `apps/web` — React, Vite, TanStack Query/Router, and Tiptap UI.
- `apps/api` — Fastify modular backend, authentication, persistence, context, and generation orchestration.
- `packages/contracts` — shared Zod transport and content contracts.
- `packages/core` — prompt rendering, mention matching, recursive discovery, segmentation, and budgeting.
- `packages/content` — immutable, versioned built-in prompts and ideation definitions.
- `packages/ai` — OpenRouter and deterministic fake-provider adapters.
- `packages/db` — Drizzle schema and migrations.
- `packages/config` — validated server environment configuration.

## Authentication and invitations

Hosted environments disable the development bypass and require a Better Auth session. When `INVITE_ONLY=true`, signup also requires an unexpired invitation token passed by the signup screen. Authenticated beta users can create invitation records through the API; the plaintext token is returned only once.

Every Project query is scoped through Workspace membership. New accounts receive a Personal Workspace on their first authenticated application request.

## Data safety

Scene saves use optimistic versions, including when several locked Scene blocks are displayed in one continuous editor. Manual/editor saves and accepted generations create restore points, generation candidates remain outside canonical Tiptap documents until acceptance, and sibling reordering preserves stable hierarchy IDs. Project export is available from `GET /api/projects/:id/export`.

See [operations](docs/operations.md) for deployment, backup, and recovery guidance.

## Personal Vercel deployment

Asterism can be deployed as one Vercel project, with the Vite frontend and Fastify API sharing
the same domain. Use a hosted PostgreSQL database; the recommended personal setup is Neon in
the Frankfurt region. Follow the complete [Vercel deployment guide](docs/vercel.md).
