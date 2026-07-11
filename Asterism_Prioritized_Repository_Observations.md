# Asterism Repository Review — Prioritized Observations

**Repository:** `zebevafasen/asterism`  
**Review date:** July 11, 2026  
**Scope:** Source-level review of the current `main` branch

> Historical review note: the stabilization work described here was implemented after this review. The observations are retained as rationale; the current design specification is the source of truth.

## Overall Assessment

Asterism has moved beyond being a collection of individual prototypes and now reads as a coherent, broadly feature-complete application.

The core workspaces are integrated around the same project data:

- Manuscript writing
- Continuous Act → Chapter → Scene editing
- Outline
- Compendium
- Ideation
- Prompt management
- Settings
- Project-grounded Chat

The new Chat workspace is particularly substantial. It includes persistent threads, streamed responses, response cancellation, regeneration, model selection, selectable project context, rolling conversation summaries, and Compendium-aware mention handling.

At this stage, the highest-value work is no longer broad feature expansion. The next milestone should focus on architectural consolidation, reliability, and product polish.

---

# Priority 1 — Move Chat Prompts into the Prompt Registry

## Observation

The Chat subsystem currently contains important natural-language prompts directly in backend code.

These include prompts for:

- generating the main assistant response;
- summarizing older conversation history;
- compressing oversized project context.

This creates a second prompt system beside Asterism's existing Prompt Registry.

## Why This Matters

One of Asterism's strongest architectural principles is that AI prompts are first-class, inspectable, editable, versioned data.

Leaving Chat prompts hardcoded creates several problems:

- users cannot inspect or customize Chat behavior;
- Chat prompts cannot be versioned consistently with other workflows;
- built-in prompt restoration and duplication do not apply;
- future prompt updates require code changes;
- Chat becomes architecturally inconsistent with prose generation, ideation, summaries, and Smart Context.

## Recommended Change

Add Chat-specific workflow keys to the Prompt Registry.

Suggested keys:

```text
chat.respond
chat.summarize_history
chat.compress_context
```

Each workflow should ship with a built-in Prompt Definition in the existing data-driven content package.

The Chat backend should:

1. resolve the workflow's selected Prompt Definition;
2. validate available variables;
3. render the prompt through the shared renderer;
4. send the rendered message sequence to the selected model.

## Suggested Variables

For `chat.respond`:

```text
{{project_context}}
{{conversation_summary}}
{{recent_messages}}
{{user_message}}
```

For `chat.summarize_history`:

```text
{{existing_summary}}
{{new_messages}}
```

For `chat.compress_context`:

```text
{{project_context}}
{{target_budget}}
```

## Desired Result

Chat becomes a full participant in Asterism's Prompt Builder rather than a parallel subsystem with hidden instructions.

---

# Priority 2 — Replace Character-Based Chat Limits with Model-Aware Context Budgeting

## Observation

Chat currently compresses assembled project context after it exceeds a fixed character threshold.

The response generation then separately reserves a fixed maximum number of output tokens.

This is a practical temporary safeguard, but it is not aware of the selected model's actual context window.

## Why This Matters

A fixed character threshold can be inaccurate in both directions:

- it may compress or truncate context unnecessarily for models with large context windows;
- it may still exceed the available context for smaller models;
- it does not account precisely for system messages, conversation history, summaries, or output reservations;
- it treats all selected context as one block rather than prioritizing its components.

Different models may have substantially different:

- context-window sizes;
- tokenization behavior;
- safe output limits;
- practical latency and cost constraints.

## Recommended Change

Extend the shared context-budgeting helpers into a model-aware Chat budgeting pipeline. At review time, other workflows used fixed approximate-token budgets rather than a fully model-aware pipeline.

Conceptually:

```text
Model Context Window
− Reserved Output Budget
− System and Prompt Messages
− Recent Conversation
− Rolling Conversation Summary
= Available Project-Context Budget
```

The remaining budget should be allocated among context sources using explicit priorities.

Suggested priority order:

1. directly mentioned Compendium entries;
2. explicitly selected context;
3. current or selected Scenes;
4. current outline information;
5. automatically activated Compendium entries;
6. lower-priority recursively discovered information.

## Additional Recommendation

Avoid immediately compressing the entire context package as one text block.

Prefer staged reduction:

1. remove duplicate material;
2. rank context fragments;
3. exclude low-priority fragments;
4. compact or summarize oversized individual sources;
5. apply a final fallback compression only when necessary.

## Desired Result

Chat behaves consistently across different models and makes better use of available context without unpredictable truncation.

---

# Priority 3 — Refactor Regeneration to Use the Same Direct Streaming Pipeline

## Observation

The regeneration route currently removes the previous user-and-assistant message pair and internally invokes the normal message endpoint.

The internal call is made through Fastify's injection mechanism.

## Why This Matters

An injected request generally behaves like a completed internal HTTP request rather than a directly shared live stream.

This can create several problems:

- regenerated responses may be buffered rather than delivered incrementally;
- streaming behavior may differ between normal sends and regeneration;
- headers and cancellation behavior become harder to reason about;
- one route depends on another route's transport behavior;
- error handling becomes unnecessarily indirect.

## Recommended Change

Extract the shared streaming behavior into a reusable application-level function or async generator.

Conceptually:

```text
createChatResponseStream({
  thread,
  userMessage,
  history,
  model,
  signal
})
```

Both endpoints should call this directly:

```text
POST /api/chat/threads/:id/messages
POST /api/chat/threads/:id/regenerate
```

The shared function should own:

- context assembly;
- Prompt Registry resolution;
- provider streaming;
- delta events;
- message persistence;
- cancellation;
- completion;
- failure handling;
- usage logging.

The routes should remain responsible only for:

- request validation;
- authorization;
- selecting or recreating the relevant message;
- returning the stream.

## Desired Result

Normal generation and regeneration have identical streaming semantics and share one clear implementation.

---

# Priority 4 — Prevent Assistant-Generated Mentions from Creating Context Feedback Loops

## Observation

At review time, user mentions were treated as forced Compendium references while recent assistant text was the sole scan source for automatic Chat discovery.

## Why This Matters

Assistant-generated text is not canonical project truth.

Scanning assistant responses as a strong activation source can create a feedback loop:

```text
The assistant mentions an entry
        ↓
The entry activates on the next turn
        ↓
The supplied entry makes another mention more likely
        ↓
The entry becomes increasingly persistent in the conversation
```

This can cause irrelevant characters, locations, factions, or lore to remain active merely because the model introduced them in an earlier answer.

It also gives assistant-generated wording more influence than manuscript canon or explicit user intent.

## Recommended Change

Use a clear source hierarchy for Compendium activation.

Suggested priority:

1. current user message;
2. explicitly selected context;
3. manuscript prose;
4. Scene and outline metadata;
5. rolling story or conversation state;
6. previous user messages;
7. previous assistant messages, if used at all.

Assistant-text matches should either:

- be excluded from automatic activation; or
- receive a substantially lower weight and require corroboration from another source.

## Additional Recommendation

Track the provenance of each activated entry.

Example:

```text
Entry: Blackthorn Society
Reason: Direct user mention
Source: Current chat message
```

or:

```text
Entry: Nora Bell
Reason: Recursive discovery
Source: Julia Ashford entry
Depth: 1
```

This would prepare Chat for a future Context Inspector.

## Desired Result

Project context follows user intent and project canon rather than being reinforced by the model's own earlier wording.

---

# Priority 5 — Make Project Workspace State URL-Aware

## Observation

The current project URL primarily identifies the Project itself.

Important workspace state is held inside React component state, including:

- selected top-level tab;
- Manuscript or Outline view;
- current manuscript scope;
- selected Scene;
- selected Chat thread;
- potentially selected Compendium entry.

## Why This Matters

Component-only state makes the workspace less durable and less navigable.

Possible consequences:

- refreshing the page returns the user to a default state;
- browser Back and Forward behavior does not reflect workspace navigation;
- a specific Scene, Chat thread, or Outline view cannot be bookmarked;
- links cannot take a user directly to the relevant working context;
- debugging and tester feedback become harder because locations are not reproducible.

## Recommended Change

Represent meaningful workspace state in route search parameters or nested routes.

Examples:

```text
/projects/PROJECT_ID?tab=chat&thread=THREAD_ID
/projects/PROJECT_ID?tab=manuscript&view=outline
/projects/PROJECT_ID?tab=manuscript&scope=chapter:CHAPTER_ID
/projects/PROJECT_ID?tab=manuscript&scene=SCENE_ID
/projects/PROJECT_ID?tab=manuscript&entry=ENTRY_ID
```

Not every temporary UI detail needs to be represented in the URL.

Good candidates are states that users may reasonably expect to:

- refresh;
- bookmark;
- revisit;
- share during testing;
- navigate with browser history.

## Desired Result

Asterism feels like a stable application workspace rather than a single page with transient internal panels.

---

# Priority 6 — Add Required Continuous Integration Checks

## Observation

The repository already exposes useful project-wide commands for:

- TypeScript checking;
- linting and formatting validation;
- unit testing;
- Playwright end-to-end testing;
- production builds.

The reviewed commit had a successful Vercel deployment status, but no GitHub Actions workflow runs were present.

## Why This Matters

As the application becomes feature-complete, regression risk becomes more important than raw development speed.

The current systems interact in complex ways:

- editor state and autosave;
- optimistic versions;
- generation candidates;
- database migrations;
- authentication;
- ownership checks;
- Compendium matching;
- context assembly;
- prompt rendering;
- streaming;
- import and export;
- Chat history.

A deployment succeeding does not prove all of these systems remain valid.

## Recommended Change

Add a GitHub Actions workflow that runs at least:

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Run Playwright in a separate job with PostgreSQL available.

Suggested pull-request requirements:

- typecheck passes;
- lint passes;
- unit tests pass;
- build passes;
- key end-to-end workflows pass;
- database migrations can be applied to a clean test database.

## Suggested High-Value E2E Coverage

- create a Project;
- create Act, Chapter, and Scene entities;
- write and save Scene prose;
- switch scope without losing edits;
- run streamed prose generation;
- Accept, Reject, and Regenerate;
- open a Compendium mention;
- create and use a Chat thread;
- add manual Chat context;
- stop a Chat response;
- regenerate a Chat response;
- export and import a Project;
- authenticate and verify project isolation.

## Desired Result

New polish work and architectural refactors can proceed without repeatedly breaking already completed features.

---

# Priority 7 — Replace Native Browser Prompts and Confirmations

## Observation

Some rename and delete actions still use native browser dialogs such as:

```text
window.prompt()
window.confirm()
```

## Why This Matters

These interactions now stand out because the surrounding application has developed a distinct visual language.

Native dialogs:

- do not match Asterism's dark interface;
- provide limited validation and explanatory content;
- cannot show detailed consequences;
- behave inconsistently across browsers;
- feel like prototype remnants;
- are difficult to extend with undo, warnings, or additional fields.

## Recommended Change

Create reusable application dialogs for:

- renaming Projects;
- renaming Chat threads;
- deleting Projects;
- deleting Chat threads;
- deleting Acts, Chapters, Scenes, and Compendium entries where applicable.

Destructive dialogs should clearly explain scope.

Example:

```text
Delete “The Glass Station”?

This permanently deletes:
- 3 Acts
- 14 Chapters
- 62 Scenes
- associated generation history

This action cannot currently be undone.
```

For ordinary renaming, use a compact modal or inline-edit pattern.

## Desired Result

Common interactions feel deliberate and visually consistent across the application.

---

# Priority 8 — Make Project Card Artwork Stable

## Observation

Project-card artwork variants are currently selected using the Project's current position in the rendered list.

## Why This Matters

The same Project can receive a different visual treatment when:

- the user searches;
- Projects are sorted;
- a Project is created or deleted;
- server ordering changes.

This weakens visual recognition in the Project Library.

## Recommended Change

Derive the default artwork variant from a stable value.

Possible approaches:

1. hash `project.id` into one of the existing variants;
2. store a generated artwork seed on the Project;
3. allow the user to choose or upload a cover later.

For the current implementation, hashing the Project ID is the simplest improvement.

Conceptually:

```text
variant = stableHash(project.id) % availableVariantCount
```

## Desired Result

Each Project retains a recognizable appearance across searches, sorting, and future sessions.

---

# Priority 9 — Update the Design Specification to Match the Current Product

## Observation

The original specification still describes the application as StoryLoom and treats several implemented systems as future work or unresolved design questions.

The current repository now includes substantial capabilities beyond parts of the specification, including:

- Asterism naming and branding;
- integrated Chat;
- project import and export;
- encrypted per-user OpenRouter credentials;
- authentication and invitations;
- Personal Workspace ownership;
- restore-point foundations;
- optimistic Scene versions;
- continuous multi-Scene editing;
- a one-project Vercel deployment model;
- detailed deployment and operations documentation.

## Why This Matters

A stale specification becomes misleading for:

- future development;
- AI-assisted coding;
- contributor onboarding;
- architecture decisions;
- testing priorities;
- scope discussions.

It may also cause already implemented features to be redesigned unnecessarily.

## Recommended Change

Revise the specification into an accurate current-state document.

Suggested structure:

```text
1. Product Overview
2. Current Implemented Capabilities
3. Current Architecture
4. Core Domain Model
5. AI Workflow Architecture
6. Chat System
7. Context and Memory Systems
8. Editor and Manuscript Model
9. Deployment and Operations
10. Remaining Known Gaps
11. Near-Term Stabilization Roadmap
12. Future Product Directions
```

Remove or rewrite sections that still describe completed features as speculative.

Clearly distinguish:

- implemented;
- partially implemented;
- planned;
- exploratory.

## Desired Result

The documentation becomes a reliable source of truth for the actual application.

---

# Priority 10 — Preserve the Current Single-Domain Vercel Deployment Direction

## Observation

The current deployment documentation places the Vite frontend and Fastify API in one Vercel project and on one domain.

This differs from the earlier idea of separate Vercel projects for web and API.

## Assessment

The current direction is sensible for the personal and private-beta stage.

Benefits include:

- fewer cross-origin issues;
- simpler Better Auth cookie handling;
- simpler API routing;
- fewer deployment settings;
- a single stable public hostname;
- easier personal administration.

The internal frontend/backend separation remains intact even though both are deployed together.

## Recommendation

Keep the single-domain deployment for the current stage.

Avoid coupling core application logic directly to Vercel so that the API can later move to a long-running Node host if needed.

Likely triggers for moving the API include:

- frequent generation requests exceeding function-duration limits;
- increased concurrency;
- WebSocket requirements;
- background jobs;
- more advanced streaming behavior;
- queue-based memory or summary processing.

## Desired Result

Deployment remains simple now without closing off a more scalable hosting model later.

---

# Additional Product and Architecture Strengths

These are positive observations that should be preserved during refactoring.

## Chat Is a Real Product Workspace

The current Chat implementation includes:

- persistent per-user threads;
- persistent messages;
- streamed assistant responses;
- stop behavior;
- regeneration;
- thread renaming and deletion;
- per-thread model selection;
- automatic first-message thread titles;
- rolling summaries of older conversation history;
- selectable manuscript context;
- selectable outline context;
- Act, Chapter, and Scene context selection;
- individual and grouped Compendium context selection;
- automatic Compendium activation;
- context compression fallback;
- usage tracking;
- Compendium mention rendering in responses;
- Compendium mention highlighting in the message composer.

This is substantially more than a decorative chat panel.

## Workspace Integration Is Strong

The main Project workspace now integrates:

- Manuscript;
- Outline;
- Chat;
- Ideation;
- Compendium.

The editor is flushed before moving into several other views, which is an important protection against lost or stale edits.

## Data Safety Foundations Are Improving

The repository documents several useful safety mechanisms:

- optimistic Scene versions;
- restore points;
- generated candidates remaining separate from canonical documents until acceptance;
- stable hierarchy identifiers during reordering;
- Project export;
- database backup guidance.

These foundations are more important than adding another visible feature.

## Credential Handling Has Matured

The application supports:

- server-side OpenRouter use;
- encrypted stored user keys;
- a server credential fallback;
- an explicit encryption secret;
- no plaintext-key return to the browser.

This is a strong improvement over browser-exposed provider credentials.

---

# Suggested Stabilization Milestone

The recommended implementation order is:

```text
1. Chat Prompt Registry integration
2. Model-aware Chat context budgeting
3. Shared direct streaming pipeline for send and regenerate
4. Safer Compendium activation provenance and weighting
5. URL-aware workspace state
6. Required CI checks
7. Application-native rename and delete dialogs
8. Stable Project artwork
9. Specification and documentation update
```

This should be treated as a stabilization and consolidation milestone rather than a new feature milestone.

---

# Suggested Definition of Done

The stabilization milestone can be considered complete when:

- every Chat AI call resolves a registered Prompt Definition;
- Chat context limits are derived from the selected model;
- regeneration streams through the same code path as normal responses;
- assistant-generated wording cannot strongly self-activate context without corroboration;
- refreshing preserves the selected major workspace location;
- required CI passes before merging;
- common rename and delete actions no longer use browser-native dialogs;
- Project cards retain stable artwork;
- the main specification accurately describes the current Asterism application;
- deployment documentation and the actual production setup agree.

---

# Review Limitation

This review was based on the current repository source and commit history.

The application and test suite were not executed locally as part of this review. Runtime behavior, visual details, browser-specific behavior, production latency, migration behavior, and end-to-end reliability should therefore be validated separately.
