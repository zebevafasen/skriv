# Asterism Design Specification

**Status:** Current-state source of truth
**Updated:** July 11, 2026

## 1. Product Overview

Asterism is a private, full-stack workspace for planning and writing long-form fiction. It combines a continuous Scene-based manuscript, an Outline, a structured Compendium, story Ideation, editable AI prompts, and project-grounded Chat. Human edits remain canonical; generated prose stays provisional until accepted.

Status terms below are **Implemented**, **Partial**, **Planned**, and **Exploratory**.

## 2. Current Capabilities

- **Implemented:** Projects organized as Act → Chapter → Scene with stable identifiers and reorderable positions.
- **Implemented:** Continuous and single-Scene Tiptap editing, autosave, optimistic versions, restore points, and generation candidates.
- **Implemented:** Outline editing, Scene metadata, labels, summaries, and Compendium links.
- **Implemented:** Compendium aliases, exclusions, matching rules, activation modes, recursive discovery, and mention navigation.
- **Implemented:** Ideation ingredients, user definitions and collections, randomized selection, and premise generation.
- **Implemented:** Prompt Registry with built-in and user-owned definitions, workflow bindings, validation, duplication, restoration, and Chat workflows.
- **Implemented:** Persistent Chat threads, streaming, cancellation, safe regeneration, rolling summaries, selectable project context, Smart Context, and model-aware budgeting.
- **Implemented:** Import/export, invitations, authentication, Personal Workspace ownership, encrypted per-user OpenRouter credentials, usage events, and deterministic fake AI.
- **Implemented:** URL-addressable workspace state, application-native dialogs, stable Project artwork, single-domain Vercel deployment, and GitHub Actions CI.

## 3. Architecture

Asterism is a pnpm/Turborepo TypeScript monorepo:

- `apps/web`: React, Vite, TanStack Router/Query, Tiptap, and application-native UI.
- `apps/api`: Fastify, authentication, ownership, context assembly, prompt resolution, streaming, and persistence orchestration.
- `packages/contracts`: Zod transport and content contracts.
- `packages/core`: prompt rendering, mention matching, discovery, segmentation, and token approximation.
- `packages/content`: immutable versioned built-in prompts and ideation content.
- `packages/ai`: provider-neutral OpenRouter and fake-provider adapters.
- `packages/db`: Drizzle schema, migrations, and PostgreSQL access.
- `packages/config`: validated server configuration.

The web and API remain logically separate but deploy together on one origin. Domain logic must remain host-portable.

## 4. Domain Model and Data Safety

A Workspace owns Projects. A Project owns Acts and Compendium entries; Acts own Chapters; Chapters own Scenes. Position represents order and never identity. Scene canonical state contains a Tiptap document, plain text, metadata, and an optimistic version. Revisions preserve recoverable snapshots.

Prompt Definitions are built-in or user-owned and selected through per-user workflow bindings. Chat threads belong to one user and Project and contain ordered messages, selected context, and a rolling summary. Provider credentials are encrypted at rest and plaintext is never returned to the browser.

## 5. AI Workflows

Every AI call uses an explicit model, role-based message sequence, output limit, and optional abort signal. User-facing wording resolves through the Prompt Registry. Implemented workflows are:

- `prose.start`, `prose.continue`, `prose.toward_event`
- `ideation.premise`, `context.extract`, `summary.scene`
- `chat.respond`, `chat.summarize_history`, `chat.compress_context`

Generated prose remains a separate candidate. Accept merges it into canonical Scene state and creates a revision; Reject leaves canonical prose untouched; Regenerate creates a related candidate.

## 6. Chat, Context, and Memory

Chat uses one streaming pipeline for send and regenerate. It owns prompt resolution, context assembly, provider streaming, persistence, cancellation, failures, completion, and usage logging. Regeneration retains the previous assistant response until the replacement succeeds.

The selected model's context length determines the budget. The smaller of 8,000 tokens or 25% of the window is reserved for output, plus a 5% safety margin with a 512-token minimum. Prompt framing, the current request, summary, and newest turns are retained before project context.

Context is assembled as provenance-bearing fragments in this priority order: explicit selections, current-user mentions, selected manuscript material, selected outline material, always-active entries, recursive discoveries, and Smart Context selections. Duplicates are removed, low-priority fragments are dropped first, and oversized sources are compressed individually.

Matching respects tracking, aliases, exclusions, case sensitivity, activation mode, recursion depth, and Smart Context settings. Manual selection is an explicit override. Assistant-authored matches may corroborate an already activated entry but cannot activate one independently. Rolling summaries are conversation memory, not canonical story truth.

## 7. Editor and Workspace

The editor flushes pending changes before major navigation. Project URLs may encode `tab`, `view`, `scope`, `scene`, `thread`, and `entry`; stale identifiers fall back safely. Responsive visibility, menus, drafts, and previews remain transient.

Rename and destructive operations use accessible application dialogs. Project artwork is derived deterministically from Project identity and stays stable across filtering and sorting.

## 8. Deployment and Operations

Local development uses Docker PostgreSQL, Vite, and Fastify. Hosted deployment uses one Vercel project and one public origin with hosted PostgreSQL. Better Auth cookies and `/api` routing remain same-origin.

GitHub Actions runs frozen installation, typecheck, lint/format validation, unit tests, and build. A separate PostgreSQL-backed job applies migrations to an empty database and runs Playwright in Chromium.

## 9. Known Gaps and Future Directions

- **Partial:** Context provenance is internal; a user-facing Context Inspector is not implemented.
- **Partial:** Token counts use conservative approximation rather than provider-specific tokenizers.
- **Partial:** Restore-point foundations exist, but the end-user history browser remains limited.
- **Planned:** Broader device E2E coverage and deeper failure-injection tests.
- **Planned:** Background jobs if large summary, memory, or import/export workloads exceed synchronous limits.
- **Exploratory:** Collaboration, user-defined Compendium types, revision workflows, richer Project covers, and a long-running API host.

Future work must preserve canonical-data safety, prompt inspectability, ownership checks, provider portability, and exportability.
