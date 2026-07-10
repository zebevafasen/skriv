# Asterism Design Specification

## 1. Product Overview

Asterism is an AI-assisted long-form fiction writing application inspired by the core workflow of tools such as NovelCrafter, while introducing its own systems for story ideation, contextual AI generation, and structured story knowledge.

The application consists of two primary but interconnected creative environments:

1. **The Manuscript Editor**, where users write, edit, and generate prose.
2. **The Story Ideation System**, where users can generate premises and story concepts from combinations of genres, themes, and general-purpose tags.

At the center of the application is the **Smart Compendium**, which acts as Asterism's persistent story-knowledge and AI-context backbone.

The systems are designed to work independently or together. A user may begin directly with a manuscript and never use the ideation system, or they may generate and refine a premise before beginning the writing process.

Story metadata created or selected during ideation—including genres, themes, tags, and the premise itself—remains available to the rest of the project. The user can optionally include this information in later AI generation requests through the Compendium-driven context system.

The application should not assume that every available piece of project information should always be sent to the AI. Context inclusion is selective, contextual, and user-configurable.

---

# 2. Core Design Principles

## 2.1 Writing Remains Primary

The manuscript editor must remain useful as a normal writing environment without requiring AI generation.

AI assistance augments the writing workflow rather than replacing it.

## 2.2 Generated Text Becomes Normal Text

Once accepted, generated prose behaves like ordinary manuscript prose.

Accepted text remains fully editable and deletable.

Asterism should not permanently separate "human text" and "AI text" inside the manuscript unless generation history is intentionally stored as metadata.

## 2.3 Context Is Selective

Project information existing in Asterism does not automatically mean that it should be included in every AI prompt.

The Context Engine decides what information is relevant to the current operation.

## 2.4 The Compendium Is a Core Subsystem

The Compendium is not merely a lore database beside the manuscript.

It is the central persistent knowledge system that feeds AI context throughout Asterism.

## 2.5 Free-Form Input Is Important

Asterism should not force users to formally model every creative thought before using it.

This applies to:

- free-form ideation tags;
- free-form Continue Toward Event targets;
- free-form Compendium content;
- optional structured custom fields.

Structured systems should support creativity rather than become prerequisites for it.

## 2.6 Structure and AI Representation Are Separate

The way information is stored and edited in the interface does not have to match the format sent to AI models.

Structured application data may be normalized into clear model-readable text before AI processing.


## 2.7 Data-Driven by Default

As much Asterism content and behavior as practical should be data-driven rather than hardcoded.

Examples include:

- built-in Compendium Entry Types;
- default Compendium entries or templates;
- Genres;
- Themes;
- General Tag packs;
- user-created Tag collections;
- prompt definitions;
- workflow-to-prompt bindings;
- model-role defaults;
- configurable generation presets;
- future field templates and content packs.

Where practical, built-in packages should be represented through external structured data such as JSON files or an equivalent schema-driven format.

The exact serialization format may vary where technically appropriate, but the architectural principle remains:

> Built-in content should generally be loaded through the same data contracts and registries used by extensible or user-created content, rather than being embedded directly in UI components or workflow code.

This improves:

- maintainability;
- extensibility;
- versioning;
- migration;
- community content-pack support;
- user customization;
- testing.

Data-driven configuration does not mean that all runtime application state must be stored as JSON files. Persistent user and project state may use a database. JSON or similar structured files are primarily intended for definitions, packages, defaults, templates, seeds, and import/export representations.

## 2.8 Full-Stack from the Beginning

Asterism should be designed as a full-stack application from the start rather than beginning as a frontend-only prototype that later requires an architectural rewrite.

The initial development environment must support local development of the complete system, including:

- frontend application;
- backend API or application server;
- persistent storage;
- migrations;
- AI-provider integration;
- streaming responses;
- local configuration and secrets;
- seed or package loading;
- tests.

The exact framework and deployment topology remain open, but the separation of concerns should be established early enough that AI calls, prompt resolution, context assembly, persistence, and sensitive provider credentials are not permanently coupled to frontend components.

## 2.9 Prompts Are First-Class Editable Data

Prompts are a core Asterism subsystem rather than hidden strings embedded in application code.

Every AI workflow should resolve a designated prompt definition through a Prompt Registry.

Users should be able to:

- inspect built-in prompts;
- modify editable copies or overrides;
- create new prompts;
- assign compatible prompts to workflows;
- choose among multiple prompts for a workflow where allowed;
- restore or return to built-in defaults.

Prompt definitions should be data-driven and versionable.

The Prompt Builder must provide a usable in-app interface for creating and modifying prompt templates without requiring users to edit source files.


## 2.10 Default Visual Direction

Asterism should use a sleek, modern dark interface by default.

The initial visual direction is:

- dark gray surfaces rather than pure black as the primary foundation;
- restrained contrast suitable for long writing sessions;
- yellow-to-orange accent colors for emphasis, active states, links, highlights, and selected controls;
- minimal visual clutter in the manuscript editor;
- compact contextual interfaces for AI generation and Compendium interactions.

This is a broad visual direction rather than a finalized design system.

Detailed typography, spacing, component styling, theme variants, accessibility contrast targets, and responsive behavior will be specified during dedicated UI design work.

Colors should be implemented through theme tokens or equivalent design variables rather than scattered hardcoded values, so the visual system can evolve without rewriting individual components.

---

# 3. Project and Manuscript Structure

## 3.1 Project Hierarchy

Asterism uses the following manuscript hierarchy:

**Project → Act → Chapter → Scene**

A Project represents the complete story or manuscript workspace.

A Project contains one or more Acts. Each Act contains one or more Chapters, and each Chapter contains one or more Scenes.

The Scene is the lowest manuscript organization level and the actual container for prose.

```text
Project
├── Act
│   ├── Chapter
│   │   ├── Scene
│   │   ├── Scene
│   │   └── Scene
│   └── Chapter
│       └── Scene
└── Act
    └── Chapter
        └── Scene
```

## 3.2 Scene Requirement

Manuscript prose can only exist inside a Scene.

The user must therefore have an active Scene before they can write or request prose generation.

Acts and Chapters are organizational containers and do not directly contain prose outside their child Scenes.

This distinction should remain explicit throughout the application architecture.

For example:

- the editor opens a Scene;
- autosave operations save Scene content;
- prose generation targets a Scene and cursor position;
- context can be assembled around a Scene;
- manuscript export reconstructs the story from the ordered hierarchy.

## 3.3 Ordering

Acts, Chapters, and Scenes are ordered entities.

The user should be able to reorder them.

Stable identity must remain separate from display order. Reordering a Scene changes its position rather than recreating it as a new entity.

---

# 4. Manuscript Editor

## 4.1 Purpose

The Manuscript Editor is the primary writing environment in Asterism.

At its foundation, it is a conventional prose editor. The user can write and edit manuscript text directly without interacting with AI features.

AI assistance is an optional layer on top of the standard writing experience.

## 4.2 Inline AI Command Menu

The user can invoke an AI generation menu from the current cursor position using an editor command trigger.

The initial proposed trigger is:

```text
/
```

When invoked, a small contextual popup appears near the cursor.

The menu provides three primary prose-generation modes:

- **Start Writing**
- **Continue Writing**
- **Continue Toward Event**

Each generation mode may expose additional options before generation begins.

Common configurable options include:

- optional user instructions;
- AI model selection;
- desired output length;
- output length unit.

AI models are accessed through OpenRouter.

Output length can initially be expressed using either:

- approximate word count;
- approximate paragraph count.

Requested length is a generation target rather than a strict guarantee.

---

# 5. Prose Generation Modes

## 5.1 Start Writing

Start Writing is intended for beginning prose where little or no manuscript text exists immediately before the cursor.

Its purpose is to establish opening prose for the current writing context.

Because there may be little existing prose from which to infer tone, pacing, circumstances, or direction, Start Writing may rely more heavily on broader story and Scene-level planning context.

Potential context sources include:

- premise;
- genres;
- themes;
- project tags;
- current Scene information;
- relevant Compendium information;
- style instructions;
- user-provided generation instructions.

The exact context assembly rules belong to the Context Engine.

## 5.2 Continue Writing

Continue Writing generates prose that directly continues from manuscript text immediately preceding the cursor.

This mode prioritizes continuity with existing prose.

Relevant context may include:

- prose immediately preceding the cursor;
- broader current Scene text;
- Scene planning information;
- relevant Compendium information;
- recent narrative memory;
- active story metadata;
- style instructions;
- optional user instructions.

## 5.3 Continue Toward Event

Continue Toward Event generates prose that both continues naturally from the current manuscript position and moves the narrative toward a specified event, outcome, beat, or destination.

The Event is initially free-form text entered by the user.

Examples:

- Julia finds a secret door.
- Marcus finally admits that he lied.
- The train stops unexpectedly in the forest.
- The argument escalates into violence.
- End with Thomas deciding to leave the city.

The Event represents a narrative destination rather than a fact that must be mentioned immediately.

The generation should:

1. continue naturally from the prose before the cursor;
2. preserve continuity with the current Scene;
3. progress meaningfully toward the supplied Event;
4. respect the requested generation length;
5. avoid forcing the Event to occur immediately unless the available length and instructions suggest that it should.

For example:

Current prose:

> Julia ran her fingers along the cracked wallpaper. Something about the pattern bothered her.

Target Event:

> Julia finds a secret door.

The generation may build toward the discovery through investigation, environmental detail, hesitation, or other appropriate narrative movement rather than immediately revealing the door.

---

# 6. Prose Generation Lifecycle

## 6.1 Invocation and Configuration

A prose-generation operation begins inside the active Scene.

The user:

1. places the cursor at the desired insertion point;
2. invokes the `/` command interface;
3. selects a generation mode;
4. optionally enters instructions;
5. selects an OpenRouter model;
6. selects a target output length;
7. selects words or paragraphs as the target unit;
8. starts generation.

## 6.2 Streaming Generation

Generated prose should stream directly into the Scene editor at the original cursor position.

The user should see text as it is produced rather than waiting for the full response.

However, the streamed result initially remains in a temporary generation state.

```text
Generation Requested
        ↓
Streaming Temporary Generation
        ↓
Generation Complete
        ↓
Accept / Regenerate / Reject
        ↓
Accepted Manuscript Text
```

## 6.3 Temporary Generation State

While generation is active, Asterism retains metadata describing the generation operation.

At minimum:

- Scene identifier;
- generation start position;
- generation end position;
- generation mode;
- model used;
- optional instructions;
- target length;
- target length unit;
- Event target when applicable;
- status;
- sufficient data to regenerate.

The generated text should appear visually inside the manuscript while remaining logically identifiable as the active AI generation.

A recommended internal model is to avoid permanently committing the streamed candidate into canonical Scene state until acceptance.

Conceptually:

```text
Canonical Scene:
"The hallway was completely silent."

Active Generation:
{
  insertionPoint: ...,
  streamedText: "Julia placed one hand against...",
  mode: "toward_event",
  event: "Julia finds a secret door",
  model: "...",
  status: "complete"
}
```

The editor renders both together, but the active candidate remains separately manageable until accepted.

## 6.4 Accept

Accept commits the generated candidate as ordinary manuscript prose.

After acceptance:

- the text remains fully editable;
- the user may modify it;
- the user may delete part or all of it;
- the active temporary generation state ends;
- generation-specific controls no longer need to remain attached to the segment.

Acceptance does not make prose immutable.

## 6.5 Reject

Reject removes the active generated candidate and restores the Scene to the manuscript state immediately before generation began.

The cursor should normally return to the original insertion point.

## 6.6 Regenerate

Regenerate replaces the active candidate with a new generation.

The user may optionally add or replace custom instructions before regeneration.

Examples:

- Make the dialogue more tense.
- Slow down and describe the environment more.
- Julia should be suspicious, not frightened.
- Use shorter paragraphs.

Regeneration should preserve the underlying generation mode unless the user intentionally starts a new request.

For Continue Toward Event, the Event target should also remain unless explicitly changed.

The handling of historical rejected or regenerated candidates may be added later.

---

# 7. Story Ideation System

## 7.1 Purpose

The Story Ideation System is an optional environment for generating story premises and concepts.

Its purpose is not to replace manual planning. It provides a structured way to combine creative constraints and inspirations into potentially distinctive story concepts.

The user may:

- manually select inputs;
- randomly select inputs;
- combine manual and random selections.

The system uses three main categories:

- **Genres**
- **Themes**
- **General Tags**

## 7.2 Genres

Genres describe broad literary or narrative categories.

Examples:

- fantasy;
- science fiction;
- horror;
- mystery;
- romance;
- historical fiction;
- thriller.

A project may contain multiple genres.

Genre information may later be supplied as optional context to AI operations.

## 7.3 Themes

Themes describe recurring conceptual, emotional, philosophical, or moral concerns.

Examples:

- grief;
- identity;
- revenge;
- found family;
- corruption;
- sacrifice;
- freedom;
- obsession.

A project may contain multiple themes.

Theme information may later be supplied as optional context to AI operations.

## 7.4 General Tags

General Tags are intentionally flexible.

Unlike Genres and Themes, General Tags are not restricted to a specific semantic category. They may represent almost any story ingredient, constraint, motif, subject, aesthetic, character trait, object, setting element, or creative prompt.

Examples:

- male protagonist;
- medieval;
- animal focus;
- trains;
- isolated village;
- unreliable narrator;
- winter;
- sibling rivalry;
- forbidden technology.

The purpose of General Tags is to allow unusual combinations that encourage more distinctive premise generation.

Example:

```text
Genre: Fantasy
Theme: Grief
Tags: Trains, Animal Focus, Isolated Village
```

The premise generator should interpret the combination creatively rather than merely mentioning each item independently.

## 7.5 Tag Sources

Asterism ships with a default global package of:

- Genres;
- Themes;
- General Tags.

Users are not restricted to the built-in library.

They may freely enter custom values into relevant fields.

## 7.6 Free-Form Tag Input

Tag inputs support comma-separated free-form values.

Example:

```text
trains, animal focus, frozen continent, political marriage
```

Each comma-separated value becomes an individual selected tag.

The user does not need to formally create a permanent tag definition before using a custom value.

## 7.7 User Collections

Users may create reusable collections of tags.

Examples:

- Favorite Tropes;
- Weird Settings;
- Dark Fantasy Ingredients;
- Character Archetypes;
- Romance Dynamics;
- Personal Writing Interests.

A user-created collection is a named reusable set of ideation values.

## 7.8 Base Package Control

The Asterism Base Package can be disabled.

Disabling it hides or excludes its values from selection and randomization without deleting them.

```text
Available Ideation Sources
├── Asterism Base Package [enabled / disabled]
├── User Collection: Favorite Tropes
├── User Collection: Strange Settings
└── Free-Form Current Input
```

## 7.9 Random Selection

Random premise generation may draw from currently enabled sources.

The system should distinguish between:

- manually locked selections;
- randomly selectable categories or slots;
- enabled collections.

Example:

```text
Genre: Gothic Horror
Theme: Grief
```

with randomly selected General Tags:

```text
Tags: trains, birds, abandoned hotel
```

## 7.10 Premise Generation

The user selects or randomly generates a combination of:

- one or more Genres;
- one or more Themes;
- zero or more General Tags.

The user then requests premise generation from an AI model.

The resulting premise becomes editable project data rather than a temporary response.

The user should be able to:

- edit the generated premise manually;
- regenerate it;
- generate alternatives;
- retain selected Genres, Themes, and Tags;
- change values after generation;
- optionally use the premise and metadata in later writing prompts.

The premise should therefore be treated as first-class project data.

---

# 8. Shared Story Metadata

Genres, Themes, General Tags, and the Premise form a shared layer of story metadata.

These values may be used by multiple Asterism systems.

Example:

```text
Genres + Themes + Tags
        ↓
Premise Generator
        ↓
Generated Premise
```

Later:

```text
Selected Story Metadata
        +
Manuscript Context
        +
Scene Context
        +
Compendium Context
        +
User Instructions
        ↓
Writing Model
        ↓
Generated Prose
```

Story metadata inclusion is optional.

The user may want high-level premise and thematic context in some generations while relying mainly on immediate prose and Scene context in others.

The architecture should therefore avoid hardcoding all story metadata into every prompt.

---

# 9. Smart Compendium Overview

The Smart Compendium is the central knowledge and context system of Asterism.

It stores structured and semi-structured information about the story and provides relevant information to AI operations.

Its responsibilities include:

- storing information about characters, locations, objects, factions, lore, and other story concepts;
- detecting when entries are relevant to a writing context;
- activating entries through names and aliases;
- recursively discovering related entries;
- applying activation rules;
- optionally using a smaller AI model to extract only contextually relevant information;
- supplying the resulting context package to the Writing Model;
- storing or representing special System context.

The central design principle is:

> Entry relevance and information relevance are separate problems.

An entry may be relevant without every piece of information inside that entry being relevant.

Asterism therefore supports both traditional entry retrieval and optional AI-assisted information filtering.

---

# 10. Compendium Entry Model

## 10.1 Basic Entry Model

A Compendium Entry represents a persistent unit of project knowledge.

Examples:

- Character;
- Location;
- Object;
- Faction;
- Creature;
- Culture;
- Religion;
- Historical Event;
- Magic System;
- General Lore;
- System configuration or context.

Each entry has at least:

- unique identifier;
- display name;
- entry type;
- entry content;
- zero or more aliases;
- activation mode;
- case-sensitivity setting;
- project ownership or scope;
- creation metadata;
- modification metadata.

Additional fields may be introduced later.

## 10.2 Entry Types

Initial examples include:

- Character;
- Location;
- Object;
- Lore;
- Faction;
- System.

Additional built-in types may be added later.

The architecture should be compatible with future user-defined Types.

Type may assist with:

- organization;
- browsing;
- filtering;
- visual presentation;
- context interpretation;
- future type-specific behavior.

Type should not necessarily impose a rigid schema on every entry.

---

# 11. Compendium Content and Custom Fields

## 11.1 MVP Content Model

The first implementation may use:

```text
Entry
├── Name
├── Type
├── Aliases
├── Activation Mode
├── Case Sensitivity
└── Content
```

The architecture should avoid assuming that Content will permanently remain a single field.

## 11.2 Future Custom Fields

Users may later create custom fields for organization.

A Character entry might contain:

```text
Name: Julia Ashford

Role:
Detective

Appearance:
Tall, dark-haired, usually dressed too formally.

Personality:
Blunt, observant, impatient.

Relationships:
Nora Bell — childhood friend with a strained relationship.

Secrets:
Julia destroyed evidence during a previous investigation.

General Notes:
Julia is claustrophobic but refuses to admit it.
```

Another user might use:

```text
Physical Description
Internal Conflict
Important Relationships
Current Goal
Knowledge
Secrets
```

Asterism should not require all entries of one Type to share identical fields.

## 11.3 Field Definitions

A custom field may contain:

- unique identifier;
- display label;
- display order;
- text content.

Possible future additions:

- multiline or single-line presentation;
- default fields by Entry Type;
- reusable field templates;
- field visibility;
- field-specific context behavior.

These are not required for the first MVP.

## 11.4 Context Normalization

Before an entry is supplied to an AI model, Asterism should normalize the entry into a single text representation with explicit labels.

Example:

```text
[Entry Type: Character]
[Entry Name: Julia Ashford]

## Role
Detective

## Appearance
Tall, dark-haired, usually dressed too formally.

## Personality
Blunt, observant, impatient.

## Relationships
Nora Bell — childhood friend with a strained relationship.

## Secrets
Julia destroyed evidence during a previous investigation.

## General Notes
Julia is claustrophobic but refuses to admit it.
```

Field labels should be preserved because they provide useful semantic information.

The system should not concatenate custom fields into unlabeled text fragments.

## 11.5 Storage and Prompt Representation Are Separate

Internally:

```text
Entry
├── Name
├── Type
├── Aliases
├── Activation Configuration
└── Fields[]
```

Before AI processing:

```text
Structured Entry Data
        ↓
Entry Normalizer
        ↓
Normalized Text Representation
        ↓
Smart Context Extraction
        ↓
Relevant Information
        ↓
Writing Model
```

This allows the UI and data model to evolve without tightly coupling those changes to prompt templates.

## 11.6 Fields Should Not Become Hard Context Silos

The Context Engine should not assume that specific fields are always relevant or irrelevant.

For example:

- Appearance may matter during a first introduction.
- Appearance may be irrelevant during an argument between established characters.
- Relationship information may be essential during dialogue.
- Relationship information may be irrelevant during an isolated action sequence.
- Historical information may become critical when a character discovers an old document.

Field labels should guide contextual analysis rather than replace it.

---

# 12. Compendium Activation System

## 12.1 Activation Modes

Every Compendium Entry has an activation mode.

Initial modes:

### Mention

The entry becomes eligible for context when its name or one of its aliases is detected in the relevant search context.

This is the default behavior.

### Always Active

The entry is always eligible for applicable AI requests.

When Smart Context Extraction is enabled, an Always Active entry may still be reduced to only relevant information.

This means Always Active should be understood as:

> Always considered by the Context Engine.

not necessarily:

> Always insert the entire entry body.

### Never Active

The entry is never automatically supplied to AI generation.

The entry remains available for:

- user reference;
- editing;
- organization;
- potentially explicit manual inclusion.

The exact behavior of per-request forced inclusion remains open.

## 12.2 Name and Alias Matching

An entry may contain multiple aliases.

Example:

```text
Entry Name: Julia Ashford

Aliases:
- Julia
- Jules
- Ms. Ashford
```

A match against any eligible alias may activate the entry.

Aliases can support:

- shortened names;
- nicknames;
- titles;
- alternate spellings;
- former names;
- abbreviations;
- story-specific references.

Alias matching is case-insensitive by default.

Individual entries may enable case-sensitive matching.

## 12.3 Potential Matching Sources

Mention detection may inspect multiple sources.

Potential sources include:

- current Scene;
- recent prose before the cursor;
- generation instructions;
- Continue Toward Event target;
- Scene metadata;
- recent narrative memory;
- already activated Compendium entries.

The exact scanning scope and weighting rules remain to be specified.

## 12.4 Compendium Mention Underlining and Navigation

Compendium mentions should also function as a visual navigation layer throughout Asterism.

When the name or alias of a Compendium Entry appears in a supported text field, the matching mention should be visually underlined.

This behavior is primarily a user-facing navigation and awareness feature.

It is separate from AI context activation.

Therefore:

- an underlined mention may appear even when the corresponding entry uses **Never Active**;
- visual mention detection does not mean that the entry will be included in AI context;
- changing activation mode should not remove the visual underline;
- the same name and alias matching rules should be reused where practical, while keeping UI decoration and context inclusion logically separate.

Supported surfaces should include, where technically practical and semantically useful:

- manuscript Scene prose;
- Compendium Entry content;
- custom Compendium fields;
- Scene summaries;
- Chapter, Act, and Project summaries;
- premise text;
- other planning or generated text surfaces that display story content.

Purely technical fields, identifiers, settings panels, and unrelated UI text do not need Compendium mention decoration.

### Standard Click

Clicking an underlined Compendium mention should open a compact view of the matching entry.

The compact view should provide enough information for quick reference without taking the user away from the current writing context.

A compact view may include:

- entry name;
- entry Type;
- selected or condensed content;
- aliases;
- a direct Open Entry action.

The exact compact-view layout will be defined during UI design.

### Ctrl + Click

Using **Ctrl + Click** on an underlined mention should open the corresponding Compendium Entry directly in the main Compendium interface.

Platform-equivalent modifier behavior may be supported where appropriate.

### Ambiguous Matches

If one visible phrase could resolve to multiple entries, Asterism should not silently open an arbitrary entry.

A compact disambiguation menu should allow the user to choose the intended entry.

### Update Behavior

Mention decoration should update when:

- entry names change;
- aliases change;
- entry deletion occurs;
- relevant document text changes.

The implementation should avoid blocking typing responsiveness in the manuscript editor.

For large documents, mention decoration may be computed incrementally, asynchronously, or by visible document region.

---

# 13. Recursive Activation

## 13.1 Principle

Compendium Entries may refer to other entries.

When an activated entry contains a reference to another entry, Asterism may recursively discover the referenced entry.

Example:

```text
Current Scene mentions:
Julia
```

Julia's entry references:

```text
Nora
The Ashford Family
New York
Blackthorn Society
```

These may become additional retrieval candidates.

Those entries may themselves refer to further entries.

Without limits, recursive retrieval could expand indefinitely or flood the context.

## 13.2 Recursive Depth

The retrieval system should support a maximum recursion depth.

```text
Depth 0:
Directly activated entries

Depth 1:
Entries discovered from Depth 0

Depth 2:
Entries discovered from Depth 1

...

Maximum Depth:
Stop expansion
```

The exact default remains configurable.

A relatively shallow default is recommended because relevance usually decreases with graph distance.

Recursive depth should be recorded as retrieval metadata.

A directly mentioned Character should normally have more weight than a Faction discovered several hops away.

## 13.3 Candidate Discovery, Not Automatic Inclusion

Recursive activation discovers candidate knowledge.

It does not automatically guarantee final inclusion.

Example:

```text
Julia is mentioned.
        ↓
Julia entry activates.
        ↓
Julia entry references Nora.
        ↓
Nora becomes a candidate.
        ↓
Smart relevance analysis determines:
"Nora is irrelevant to the present Scene."
        ↓
No Nora information is sent to the Writing Model.
```

The pipeline should conceptually separate:

1. **Triggering** — who or what was referenced?
2. **Discovery** — what connected knowledge might matter?
3. **Filtering** — which candidates matter now?
4. **Extraction** — which facts from those candidates matter now?

---

# 14. Smart Context Extraction

## 14.1 Purpose

Traditional lorebook systems generally operate at the entry level.

The system decides that an entry is relevant and inserts most or all of it into the prompt.

Asterism adds an optional second stage:

**information-level relevance filtering.**

After candidate entries are identified, a smaller and less expensive AI model analyzes the current writing situation and extracts only information from those entries that is relevant to the current generation request.

The resulting reduced information is supplied to the primary Writing Model.

```text
Scene Context
      +
Activated Compendium Entries
      +
Recent Narrative Memory
      +
Generation Request
          ↓
Smart Context Model
          ↓
Relevant Compendium Information
          ↓
Writing Model
          ↓
Generated Prose
```

Smart Context Extraction is enabled by default but can be disabled.

## 14.2 Example

Activated candidates:

```text
Julia Ashford
New York
Nora Bell
The Ashford Family
Blackthorn Society
```

Julia's complete entry may contain:

- age;
- appearance;
- childhood history;
- relationship with Nora;
- relationship with her sister;
- occupation;
- injuries;
- favorite foods;
- political opinions;
- history with the Blackthorn Society;
- fear of enclosed spaces;
- current goals;
- speech patterns.

Suppose the Scene involves Julia entering a narrow underground tunnel beneath New York.

The Smart Context Model may reduce the information to:

```text
Julia:
- Julia is severely claustrophobic.
- She hides fear behind sarcasm.
- She has previously encountered the Blackthorn Society's underground symbols.

New York:
- The tunnel is part of an abandoned nineteenth-century service network.

Blackthorn Society:
- Members mark hidden routes with a three-pronged black symbol.
```

Unrelated information is omitted.

---

# 15. Smart Context Inputs

The Smart Context Model should use more than keyword matching.

Potential inputs include the following.

## 15.1 Current Scene Context

The current Scene is one of the strongest relevance signals.

Possible Scene inputs include:

- current prose;
- Scene title;
- Scene summary;
- Scene instructions;
- characters present;
- locations present;
- Scene-specific planning information.

Not all Scene metadata fields have been finalized.

## 15.2 Immediate Prose Context

Text near the generation point is especially important for continuation tasks.

It may indicate:

- current topic of conversation;
- immediate emotional state;
- current physical actions;
- unresolved questions;
- nearby objects;
- immediate location details.

Immediate prose should generally receive stronger relevance weight than distant text.

## 15.3 Recent Narrative Memory

Asterism may maintain or derive recent narrative state.

Potential information:

- recent Scene events;
- discoveries;
- injuries;
- temporary emotional states;
- promises;
- unresolved conflicts;
- recently acquired objects;
- active goals.

The memory architecture remains an open design area.

## 15.4 Characters in the Scene

Characters currently present are strong relevance signals.

Their entries should generally be high-priority candidates.

Smart Context Extraction should still avoid including every fact about every present character.

## 15.5 Locations in the Scene

The current location and relevant sublocations should influence retrieval.

For example, in a palace kitchen, useful details may include:

- staff hierarchy;
- restricted doors;
- kitchen layout;
- hidden passages.

The entire architectural history of the palace may be irrelevant.

## 15.6 Generation Mode

Different generation modes require different relevance judgments.

### Start Writing

May require broader context to establish:

- setting;
- viewpoint;
- tone;
- character situation;
- Scene objective.

### Continue Writing

May prioritize:

- immediate continuity;
- current participants;
- recent actions;
- unresolved dialogue;
- nearby objects and locations.

### Continue Toward Event

Must additionally consider the Event target.

Example:

```text
Event:
Julia finds a secret door.
```

The extractor may prioritize:

- Julia's investigative skills;
- concealed architecture;
- relevant room layout;
- historical renovations;
- hidden symbols;
- door mechanisms.

## 15.7 User Instructions

Per-generation instructions should influence extraction.

Example:

```text
Focus on the tension between Julia and Nora.
```

This should increase the relevance of:

- relationship history;
- current conflict;
- secrets;
- trust issues;
- recent arguments.

---

# 16. Smart Context Pipeline

The proposed pipeline is:

```text
1. Collect Request Context
          ↓
2. Detect Direct Entry Mentions
          ↓
3. Add Always Active Entries
          ↓
4. Expand Recursive References
          ↓
5. Apply Activation Rules
          ↓
6. Build Candidate Entry Set
          ↓
7. Evaluate Contextual Relevance
          ↓
8. Extract Relevant Information
          ↓
9. Enforce Context Budget
          ↓
10. Build Final Compendium Context Package
          ↓
11. Send to Writing Model
```

The design should keep these concerns conceptually separate:

- activation;
- discovery;
- relevance;
- extraction;
- budgeting;
- prompt assembly.

Implementation may combine stages internally when useful for performance.

---

# 17. Grounded Extraction Requirements

The Smart Context Model should function primarily as a selector and compressor of existing knowledge, not as a creator of new story facts.

Its output must remain grounded in:

- Compendium content;
- current manuscript context;
- relevant project state.

The Smart Context Model should not invent:

- new traits;
- new relationships;
- new world rules;
- unsupported history;
- unsupported motivations.

## 17.1 Preferred Selection Strategy

A weak approach is:

> Summarize the relevant information about Julia.

A safer approach is fact selection or source-fragment selection.

Example source facts:

```text
Fact J-001:
Julia was born in Boston.

Fact J-002:
Julia distrusts Nora because Nora disappeared for three days after their mother's death.

Fact J-003:
Julia is severely claustrophobic.

Fact J-004:
Julia hides fear through sarcasm.
```

The extractor may return:

```text
Relevant facts:
J-003
J-004
```

Asterism then retrieves the original fact text.

This is harder for the filtering model to hallucinate.

Users should not be required to write sterile fact databases. Fact segmentation could happen internally and invisibly.

## 17.2 Provenance

Where practical, selected information should retain source provenance.

Conceptually:

```text
Selected Context:
"Julia is severely claustrophobic."

Source:
Compendium Entry: Julia Ashford
```

Internal reasoning for why the fact was selected does not necessarily need to be stored or shown.

---

# 18. Smart Mode Disabled

Smart Context Extraction can be disabled.

When disabled, Asterism falls back to more conventional Compendium retrieval:

```text
Mention Detection
      +
Always Active Entries
      +
Recursive Activation
          ↓
Activated Entry Content
          ↓
Context Budgeting
          ↓
Writing Model
```

The application should still respect:

- activation modes;
- aliases;
- case sensitivity;
- recursion limits;
- overall context limits.

Disabling Smart Context does not disable the Compendium.

---

# 19. Context Budgeting

Smart extraction reduces irrelevant context but does not remove the need for explicit budgeting.

The Context Engine must account for:

- model context-window size;
- system instructions;
- manuscript context;
- recent memory;
- Compendium information;
- user instructions;
- Event target;
- requested output length.

The system must reserve output capacity before filling input context.

```text
Model Context Window
│
├── Reserved Output Budget
│
└── Available Input Budget
    ├── System Prompt
    ├── System Entries
    ├── Manuscript Context
    ├── Memory
    ├── Compendium Context
    └── User Request
```

The Compendium must not consume the entire available prompt merely because many entries activate.

Possible prioritization signals include:

- direct mention;
- Scene presence;
- Event relevance;
- immediate prose relevance;
- recursive depth;
- recency;
- explicit user inclusion;
- activation mode.

The exact scoring method remains open.

---

# 20. Model Defaults, Context Model Configuration, Cost, and Latency

## 20.1 Base Model

Asterism should allow the user to configure a **Base Model**.

The Base Model is the default model used by user-facing AI generation workflows unless the user chooses a different model for a specific request.

Initial workflows that should default to the Base Model include:

- Start Writing;
- Continue Writing;
- Continue Toward Event;
- Premise Generation;
- summary generation;
- other ordinary user-facing generation workflows unless they define a justified specialized behavior.

The Base Model should be easy to configure from Asterism's AI settings.

The exact long-term scope of the setting—global user setting, project override, or layered resolution—may evolve later.

For the MVP, the essential behavior is:

```text
Generation Workflow
        ↓
Per-Request Model Override?
├── Yes → Use Selected Override Model
└── No  → Use Base Model
```

## 20.2 Per-Request Model Override

The user should have easy access to model selection immediately before starting a generation.

For prose generation, the `/` menu should show the Base Model as the current default selection while allowing the user to choose another model for that generation only.

Equivalent model selection should be available before:

- premise generation;
- summary generation;
- other user-triggered AI workflows where model choice is relevant.

Changing the model for one generation should not automatically change the configured Base Model.

The workflow should make the distinction between:

- **default model setting**;
- **temporary request override**.

clear without adding unnecessary friction.

## 20.3 Context Model Is Separate

Smart Context Extraction introduces a model call before prose generation:

```text
Context Extraction Model
          ↓
Writing Model
```

The Context Model should remain independently configurable from the Base Model and from any per-request Writing Model override.

A user may choose an expensive model for prose generation while using a smaller inexpensive model for context extraction.

The application should not require both roles to use the same model.

## 20.4 Cost and Latency Considerations

The implementation should account for:

- extraction latency;
- generation latency;
- API cost;
- failures;
- request cancellation;
- caching;
- model availability.

Where cost information is available, Asterism may later show the distinction between Context Model usage and primary generation usage.

---

# 21. Smart Context Caching

Extraction results may be cacheable when relevant inputs have not changed.

Potential cache inputs:

- Entry content revision;
- Scene context fingerprint;
- recent-memory revision;
- Event target;
- user instructions;
- generation mode;
- Context Model;
- extraction configuration.

Changing prose near the cursor may invalidate some contextual results without necessarily invalidating all entry processing.

The exact cache design should be specified after the editor and Context Engine architecture are finalized.

---

# 22. Failure and Fallback Behavior

Smart Context failure should not make prose generation unusable.

Possible failures:

- provider timeout;
- malformed structured output;
- rate limiting;
- unavailable model;
- parsing failure.

A reasonable fallback sequence:

```text
Smart Extraction Attempt
        ↓
Success?
├── Yes → Use Extracted Context
└── No
     ↓
Use Conventional Retrieved Context
     ↓
Apply Context Budget
     ↓
Continue Writing Request
```

The user should not lose manuscript text or editor state because context extraction fails.

---

# 23. Context Inspector

Because the Compendium controls what the Writing Model knows, Asterism should eventually provide a Context Inspector.

A user might inspect a strange generation and see:

```text
Included Context:

Julia Ashford
Trigger: direct mention
Relevant information:
- Claustrophobic
- Hides fear through sarcasm
- Recognizes Blackthorn Society symbols

Nora Bell
Trigger: referenced by Julia
Relevant information:
- Relationship with Julia

Glass Church
Trigger: recursive reference, depth 2
Relevant information:
- Hidden entrance beneath the old station
```

A Context Inspector can help users:

- understand unexpected AI behavior;
- identify missing Compendium information;
- detect incorrect retrieval;
- tune aliases;
- tune activation rules;
- see whether Smart Context removed something important.

This can become a user-facing trust and debugging feature rather than only a developer tool.

---

# 24. System Compendium Context

Asterism's context configuration is integrated with the Compendium architecture through special System context.

Potential System information includes:

- premise;
- active Genres;
- active Themes;
- active Tags;
- writing style instructions;
- project-wide AI instructions;
- Start Writing behavior;
- Continue Writing behavior;
- Continue Toward Event behavior.

The exact implementation remains open.

Possible questions include:

- Is System merely an Entry Type?
- Do System Entries use different activation behavior?
- Are they inserted into different prompt positions?
- Can users create their own System Entries?
- Are premise, genres, themes, and tags physically stored as System Entries or only exposed to the Context Engine as though they were?

This needs further specification.

---


# 25. Prompt Builder and Prompt Registry

## 25.1 Purpose

The Prompt Builder is a required first-class feature of Asterism.

It allows users to inspect, modify, create, duplicate, organize, and select prompt templates used by AI workflows.

Prompts should not exist only as hardcoded strings in application logic.

Each AI workflow should have a designated default prompt definition loaded through the application's data-driven prompt system.

Examples include:

- Start Writing;
- Continue Writing;
- Continue Toward Event;
- Premise Generation;
- Smart Context Extraction;
- Scene Summary;
- Project or Act Summary;
- future memory extraction;
- future brainstorming workflows;
- future revision or rewriting workflows.

The exact workflow list may expand over time without requiring prompt text to be embedded directly in workflow code.

## 25.2 Prompt Registry

Asterism should maintain a Prompt Registry.

The registry resolves which prompt definition is used for a given AI workflow.

Conceptually:

```text
AI Workflow
     ↓
Prompt Workflow Key
     ↓
Prompt Registry
     ↓
Selected Prompt Definition
     ↓
Variable Resolution
     ↓
Rendered Prompt Messages
     ↓
Model Request
```

A workflow should refer to a stable workflow key or capability identifier rather than importing a literal prompt string.

Example conceptual workflow keys:

```text
prose.start
prose.continue
prose.toward_event
ideation.premise
context.extract
summary.scene
summary.project
memory.extract
```

The exact naming convention is an implementation detail, but stable identifiers are required.

## 25.3 Built-In Data-Driven Prompts

Every supported workflow should ship with at least one designated built-in prompt.

Built-in prompt definitions should be represented as structured data, preferably JSON or an equivalent schema-driven format.

Example conceptual definition:

```json
{
  "id": "builtin.prose.continue.default",
  "name": "Default Continue Writing",
  "workflow": "prose.continue",
  "version": 1,
  "description": "Default Asterism prose continuation prompt.",
  "messages": [
    {
      "role": "system",
      "content": "You are assisting with long-form fiction writing..."
    },
    {
      "role": "user",
      "content": "{{context_package}}\n\nContinue the manuscript from the current position.\n\n{{user_instructions}}"
    }
  ],
  "variables": [
    "context_package",
    "user_instructions"
  ]
}
```

This example is illustrative rather than a finalized prompt schema.

The important requirement is that the workflow prompt is loaded as data and rendered by a shared prompt system.

## 25.4 User-Created Prompts

Users can create their own Prompt Definitions.

A user-created prompt should be able to specify at least:

- unique identifier;
- display name;
- compatible workflow or workflow category;
- description;
- prompt messages or template body;
- supported variables;
- optional model-role recommendation;
- creation and modification metadata.

User prompts should not require modifying application source files.

## 25.5 Editing Built-In Prompts

Built-in prompt packages should remain recoverable.

A user should not permanently destroy the shipped default definition when making changes.

Recommended behavior:

1. built-in prompt is read-only as the canonical package definition;
2. user chooses Edit or Duplicate;
3. Asterism creates a user-owned override or copy;
4. the user modifies that version;
5. the workflow can be bound to the user version;
6. the user can later return to the built-in default.

This pattern avoids package updates overwriting user customizations.

## 25.6 Workflow Compatibility

Not every prompt is valid for every workflow.

For example, a Continue Toward Event prompt expects an Event target, while a Premise Generation prompt expects Genres, Themes, and Tags.

Prompt Definitions should therefore declare compatible workflows or required capabilities.

The Prompt Builder should prevent accidental assignment of clearly incompatible prompt types unless an advanced mode intentionally allows it.

## 25.7 Prompt Variables

Prompt templates should support controlled variables supplied by the workflow.

Potential variables include:

```text
{{context_package}}
{{manuscript_before_cursor}}
{{manuscript_after_cursor}}
{{scene_context}}
{{event_target}}
{{user_instructions}}
{{target_length}}
{{premise}}
{{genres}}
{{themes}}
{{tags}}
{{compendium_context}}
{{recent_memory}}
```

The exact variable set should be defined per workflow.

Unknown variables should produce clear validation errors rather than silently rendering empty content.

The Prompt Builder should show which variables are available for the selected workflow.

## 25.8 Message-Based Prompt Structure

Because many model APIs use role-based messages, the prompt system should support structured message sequences rather than only one large string.

A Prompt Definition may contain message parts such as:

- system;
- developer or equivalent provider-supported instruction role where applicable;
- user;
- assistant-prefill where supported and intentionally used.

Provider-specific differences should be handled by the AI Provider Layer.

The Prompt Builder UI should present this structure in a way that remains understandable to non-technical users.

## 25.9 Prompt Selection During Workflows

Every workflow has a designated default prompt, but users may select another compatible prompt where the workflow UI permits it.

For example, Continue Writing might offer:

```text
Prompt:
[ Default Continue Writing ▼ ]
```

Other compatible prompts could include:

- Fast Draft Continuation;
- Dialogue-Heavy Continuation;
- Lyrical Description;
- Minimalist Prose;
- custom user prompts.

The prompt selection UX should remain less visually prominent than the core writing workflow unless the user chooses advanced controls.

## 25.10 Prompt Scope and Ownership

Prompt definitions may eventually exist at multiple scopes.

Possible scopes:

- built-in global package;
- user global;
- project-specific.

The MVP may begin with built-in and user-global prompts while keeping project-specific prompt storage as a future option.

Prompt lookup should have explicit precedence rules if multiple scopes are supported.

## 25.11 Prompt Validation

Before a Prompt Definition becomes active, Asterism should validate:

- schema correctness;
- workflow compatibility;
- required variables;
- unknown variables;
- duplicate identifiers;
- malformed message structures;
- unsupported role definitions.

Validation should happen when importing data-driven prompt files and when saving prompts through the Prompt Builder.

## 25.12 Prompt Versioning and Migration

Built-in prompt definitions should include version metadata.

This supports:

- updating shipped prompts;
- migration;
- preserving user overrides;
- comparing a user-modified copy with a newer default;
- restoring defaults.

User prompt history or revision history may be added later.

## 25.13 Prompt Builder Functional Requirements

The user can:

- browse prompts;
- filter prompts by workflow;
- inspect built-in prompts;
- duplicate a built-in prompt;
- create a new prompt;
- edit a user-owned prompt;
- rename a prompt;
- edit its description;
- edit message templates;
- insert supported workflow variables;
- validate a prompt;
- select a prompt for a compatible workflow;
- restore a workflow to its default prompt;
- export or import prompt definitions in the future.

## 25.14 Separation Between Workflow Logic and Prompt Wording

Workflow code should own behavior and required inputs.

Prompt data should own the natural-language instructions and message templates used to communicate those inputs to a model.

For example, Continue Toward Event workflow code is responsible for:

- collecting the Event target;
- collecting manuscript context;
- resolving Compendium context;
- selecting the model;
- selecting length targets;
- calling the prompt renderer.

The selected prompt definition is responsible for expressing those inputs to the model.

This prevents prompt customization from becoming equivalent to rewriting application logic.

---

# 26. Proposed Context Layers

The current design suggests the following conceptual context structure:

```text
Generation Request
│
├── System Instructions
│
├── System Compendium Context
│   ├── Premise
│   ├── Genres
│   ├── Themes
│   ├── Tags
│   └── Project Instructions
│
├── Relevant Story Compendium Context
│   ├── Characters
│   ├── Locations
│   ├── Objects
│   ├── Factions
│   └── Lore
│
├── Manuscript Context
│   ├── Current Scene
│   └── Previous Prose
│
├── Recent Narrative Memory
│
├── Generation-Specific Data
│   ├── Generation Mode
│   ├── Event Target
│   └── Length Target
│
└── User Instructions
```

Not every layer must be populated for every request.

The Context Engine assembles the appropriate package for the selected operation.

---

# 27. Emerging Application Architecture

```text
                         PROJECT
                            │
            ┌───────────────┴──────────────┐
            │                              │
        MANUSCRIPT                    COMPENDIUM
            │                              │
    Acts → Chapters → Scenes       Story Knowledge
            │                      System Knowledge
            │                      Relationships
            │                      Activation Rules
            │                              │
            └───────────────┬──────────────┘
                            │
                     CONTEXT ENGINE
                            │
              ┌─────────────┴─────────────┐
              │                           │
       Traditional Retrieval       Smart Extraction
              │                           │
              └─────────────┬─────────────┘
                            │
                    FINAL CONTEXT PACKAGE
                            │
                       WRITING MODEL
                            │
                      GENERATED PROSE
```

The Manuscript represents what has been written.

The Compendium represents persistent knowledge about the story.

The Context Engine determines what the AI needs to know for the current operation.

The Writing Model produces prose from the assembled context.

---


# 28. Data-Driven Content and Configuration

## 28.1 Principle

As much Asterism content as practical should be represented through structured definitions rather than hardcoded application code.

JSON is the preferred example format for package-like content, though equivalent formats may be used where they provide a clear technical advantage.

The application should distinguish between:

1. **definition data** — packages, defaults, schemas, templates, and registries;
2. **runtime persistent data** — projects, Scenes, user entries, settings, and application state.

Definition data is a strong fit for JSON or equivalent version-controlled files.

Runtime persistent data should normally use the application's database and may support JSON import/export.

## 28.2 Data-Driven Candidates

Strong candidates for data-driven definitions include:

- Compendium Entry Types;
- default Compendium field templates;
- built-in Compendium packages;
- Genre packs;
- Theme packs;
- General Tag packs;
- user-created Tag collections;
- Prompt Definitions;
- prompt workflow bindings;
- default model-role configuration;
- generation presets;
- future style packs;
- future summary templates;
- future memory extraction definitions.

## 28.3 Package Model

Asterism should support a package concept for bundled definition data.

A conceptual package might contain:

```text
package.json
genres.json
themes.json
tags.json
prompts/
  prose-start.json
  prose-continue.json
  prose-toward-event.json
compendium-types.json
field-templates.json
```

The exact on-disk layout remains an implementation detail.

A package manifest may include:

- package identifier;
- name;
- version;
- description;
- author;
- package type;
- dependencies;
- compatibility version;
- enabled state where applicable.

## 28.4 Built-In and User Content Through Shared Contracts

Where practical, built-in content and user-extensible content should use shared schemas.

For example:

```text
Asterism Base Genre Pack
        ↓
Genre Pack Schema
        ↑
User Genre Pack
```

and:

```text
Built-In Prompt
        ↓
Prompt Definition Schema
        ↑
User Prompt
```

This reduces special-case code and makes future import/export and community packages easier.

## 28.5 Validation

All data-driven definitions must be validated before use.

Validation should detect:

- malformed JSON or equivalent syntax;
- missing required properties;
- duplicate stable identifiers;
- invalid enum values;
- incompatible schema versions;
- unresolved references;
- invalid prompt variables;
- invalid workflow bindings.

Invalid packages should fail safely and provide understandable diagnostics.

## 28.6 Stable Identifiers

Data-driven objects need stable identifiers independent of display names.

For example:

```text
id: genre.fantasy
displayName: Fantasy
```

A user may rename or localize the display label without breaking internal references.

Stable IDs are especially important for:

- prompt workflow bindings;
- package updates;
- imports;
- migrations;
- cross-project references;
- future plugin or extension systems.

## 28.7 Versioning and Migration

Data-driven package schemas should be versioned.

The application should be able to:

- identify the schema version of imported content;
- migrate older compatible definitions;
- reject unsupported versions clearly;
- preserve user modifications during built-in package upgrades.

## 28.8 User Collections

User-created Genre, Theme, and Tag collections may be stored in the database as user content while using the same logical schema as imported data-driven packs.

The application may additionally support export to JSON or another structured package format.

The core principle is shared data contracts, not mandatory direct file editing by end users.

## 28.9 Development Benefit

Data-driven definitions are especially important for AI-assisted development.

They allow a coding assistant to:

- add content without changing unrelated UI logic;
- validate content against explicit schemas;
- create repeatable fixtures;
- test package loaders;
- inspect workflow bindings directly;
- avoid scattering prompt strings and tag lists throughout the codebase.

---

# 29. Full-Stack Architecture and Local Development

## 29.1 Requirement

Asterism should be structured as a full-stack application from the beginning.

The first implementation must include a usable local development environment for the complete stack.

The project should not begin as a frontend-only proof of concept that directly embeds provider credentials or permanently stores application state only in browser-local storage.

This does not prohibit client-side state or local caching. It means that the authoritative architecture should include a backend and persistent data layer from the start.

## 29.2 Logical Layers

A recommended logical separation is:

```text
Frontend Application
        ↓
Application API
        ↓
Domain / Application Services
├── Project Service
├── Manuscript Service
├── Compendium Service
├── Prompt Registry Service
├── Context Engine
├── AI Generation Service
└── Package / Definition Registry
        ↓
Persistence Layer
        +
AI Provider Layer
        +
Streaming Transport
```

The exact frameworks remain open.

## 29.3 Frontend Responsibilities

The frontend is responsible for:

- manuscript editing UX;
- project navigation;
- Compendium management UI;
- Prompt Builder UI;
- ideation controls;
- generation controls;
- streaming display;
- temporary generation interaction;
- Context Inspector presentation;
- local optimistic state where appropriate.

The frontend should not become the sole owner of:

- provider secrets;
- canonical prompt resolution;
- authoritative persistence;
- Compendium retrieval logic;
- Smart Context extraction orchestration;
- cost accounting;
- workflow authorization or validation.

## 29.4 Backend Responsibilities

The backend or application server is responsible for:

- persistent project storage;
- data validation;
- prompt resolution and rendering;
- Compendium retrieval;
- recursive candidate discovery;
- Smart Context extraction orchestration;
- context budgeting;
- AI-provider requests;
- secure provider-key handling;
- streaming generation events;
- package loading and validation;
- server-side migrations;
- future authentication and synchronization concerns.

## 29.5 Persistence

The application should use persistent storage from the beginning.

The exact database technology remains open.

The persistence model should support at least:

- Projects;
- Acts;
- Chapters;
- Scenes;
- Scene document state;
- Compendium Entries;
- aliases;
- activation settings;
- user collections;
- premise metadata;
- Prompt Definitions or user prompt overrides;
- workflow prompt selections;
- model configuration;
- generation metadata;
- application settings.

Data-driven built-in definitions may be loaded from files into registries without necessarily being copied into the main database unless required.

## 29.6 Local Development Environment

A fresh development checkout should be able to run the complete application locally.

The local development setup should provide:

- frontend dev server;
- backend dev server;
- local database;
- database migrations;
- environment variable template;
- package or seed loading;
- test commands;
- linting and formatting commands;
- one documented startup path.

A desirable developer workflow is conceptually:

```text
1. Clone repository
2. Copy example environment file
3. Install dependencies
4. Start required local services
5. Run migrations
6. Start frontend and backend
7. Open Asterism locally
```

The exact commands depend on the selected stack.

## 29.7 Local Secrets and OpenRouter

OpenRouter or other provider credentials must not be committed to source control.

Local development should use environment-based secret configuration or another secure development-secret mechanism.

If Asterism later supports user-provided API keys, encryption and secure storage requirements must be designed explicitly.

Provider secrets should not be exposed unnecessarily to the browser.

## 29.8 Streaming Transport

Because prose generation streams into the manuscript editor, the full-stack design must support server-to-client streaming.

Possible transport mechanisms include:

- Server-Sent Events;
- streamed HTTP responses;
- WebSockets.

The exact choice depends on the selected framework and interaction needs.

The transport must support:

- incremental text chunks;
- generation status;
- cancellation;
- completion;
- structured error reporting.

## 29.9 Local Development and Production Parity

Local development should resemble the production architecture closely enough to avoid hidden integration problems.

This does not require identical infrastructure.

For example, local development may use:

- a local database service;
- local environment variables;
- a development package directory;
- mock AI-provider modes for tests.

The service boundaries and data contracts should remain representative of production behavior.

## 29.10 Testing Expectations

The architecture should support testing at multiple levels.

At minimum:

- schema validation tests for data-driven packages;
- prompt rendering tests;
- workflow-to-prompt binding tests;
- Compendium activation tests;
- alias and case-sensitivity tests;
- recursion-depth tests;
- context budgeting tests;
- API tests;
- streaming lifecycle tests;
- database migration tests.

AI model responses should be mockable so core application tests do not require paid provider calls.

## 29.11 Selected Technology Stack

The initial Asterism technology stack is now explicitly selected.

These choices should be treated as the default implementation baseline unless a later technical issue provides a strong reason to change them.

### Language and Runtime

```text
Language:
TypeScript

Compiler Configuration:
Strict mode

Runtime:
Node.js 24 LTS
```

TypeScript should be used across frontend, backend, shared contracts, package schemas, prompt schemas, Compendium logic, Context Engine logic, stream-event definitions, and tests.

The purpose of using one language across the stack is to reduce duplicated models and make shared contracts easier to validate and maintain.

### Repository and Package Management

```text
Repository:
Monorepo

Package Manager:
pnpm

Task Orchestration:
Turborepo
```

Initial repository shape:

```text
asterism/
│
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── contracts/
│   ├── db/
│   ├── core/
│   ├── content/
│   ├── ai/
│   └── config/
│
├── compose.yaml
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── biome.json
```

Suggested package responsibilities:

#### `apps/web`

The browser application.

#### `apps/api`

The Fastify backend application.

#### `packages/contracts`

Shared schemas and transport contracts, including:

- API request schemas;
- API response schemas;
- streaming event schemas;
- Prompt Definition schemas;
- package schemas;
- import and export schemas.

#### `packages/db`

Database schema, migrations, and database access configuration.

#### `packages/core`

Pure Asterism domain logic that should be testable without starting the API or database.

Examples:

- mention matching;
- alias normalization;
- recursive candidate traversal;
- relevance scoring helpers;
- context budgeting;
- prompt-variable validation;
- configuration-resolution rules.

#### `packages/content`

Built-in data-driven content:

- Genre packs;
- Theme packs;
- Tag packs;
- built-in Prompt Definitions;
- Compendium Type definitions;
- future field templates;
- future generation presets.

#### `packages/ai`

Asterism AI-provider contracts and provider adapters.

### Frontend

The selected frontend stack is:

```text
React
Vite
TanStack Router
TanStack Query
Zustand
```

Responsibilities are divided as follows:

- **React** provides the UI foundation.
- **Vite** provides frontend development and build tooling.
- **TanStack Router** handles application routing and typed route parameters.
- **TanStack Query** owns server-derived asynchronous state.
- **Zustand** is used sparingly for local application UI state.

Zustand should not duplicate server state and should not mirror the full manuscript editor state.

### Manuscript Editor

The selected editor foundation is:

```text
Tiptap
+
custom Asterism editor extensions
+
Floating UI where needed
```

Tiptap is responsible for manuscript document editing and editor state.

Asterism-specific editor extensions should support features such as:

- slash-command invocation;
- temporary streamed generation display;
- generation Accept, Reject, and Regenerate behavior;
- Compendium mention decorations;
- click and Ctrl + Click interaction;
- future annotations and contextual tools.

Compendium mention underlining should normally be implemented as editor decoration rather than permanently replacing ordinary text with special document nodes.

Floating UI may be used for:

- slash-command menus;
- compact Compendium previews;
- selection-anchored controls;
- cursor-relative contextual interfaces.

### UI and Styling

The selected UI stack is:

```text
Tailwind CSS
shadcn/ui
```

Asterism should use owned, editable components and semantic design tokens.

The initial visual direction remains:

- dark gray surfaces;
- warm yellow-to-orange accents;
- restrained contrast;
- a calm manuscript-writing surface;
- compact contextual controls.

### Forms and Validation

The selected form and validation stack is:

```text
React Hook Form
Zod
```

React Hook Form should be used for conventional forms and settings interfaces.

Zod should be used for:

- API input validation;
- shared transport contracts;
- data-pack validation;
- Prompt Definition validation;
- streaming event schemas;
- import and export validation.

The manuscript editor itself should not be treated as a React Hook Form field.

### Backend

The selected backend framework is:

```text
Fastify
```

Asterism should be implemented as a modular monolith.

The backend remains one deployable application with explicit internal modules such as:

```text
Project Module
Manuscript Module
Compendium Module
Prompt Registry
Context Engine
Generation Service
Summary Service
Ideation Service
Package Registry
Settings Module
```

These modules should have clear internal boundaries but should not be separated into microservices during the initial development phase.

### Database

The selected database is:

```text
PostgreSQL
```

The selected database-access and migration tooling is:

```text
Drizzle ORM
Drizzle Kit
pg
```

Relational storage should be used for strongly structured domain data.

JSONB should be used selectively where flexible structured data is useful, such as:

- Tiptap Scene documents;
- Prompt message structures;
- custom Compendium field values;
- generation metadata;
- package metadata.

JSON files or equivalent structured definition files remain appropriate for built-in data-driven packages and defaults.

### AI Integration

The initial AI provider is:

```text
OpenRouter
```

Asterism should use a small internal provider abstraction rather than a large generic AI-agent framework.

Conceptually:

```text
AIProvider
├── OpenRouterProvider
└── FakeAIProvider
```

The FakeAIProvider is required for deterministic tests and development workflows that should not require paid model calls.

The Context Engine, Prompt Registry, context budgeting, and Smart Context behavior remain Asterism-owned application architecture.

### Streaming

Upstream model streaming may use the provider's native streaming format.

The frontend should receive Asterism-owned normalized generation events rather than provider-specific events.

Conceptually:

```text
OpenRouter Stream
        ↓
OpenRouter Provider Adapter
        ↓
Generation Service
        ↓
Asterism Stream Events
        ↓
Frontend
        ↓
Tiptap Temporary Generation
```

Possible Asterism stream events include:

```text
generation.started
generation.delta
generation.completed
generation.failed
generation.cancelled
```

### Testing

The selected testing stack is:

```text
Vitest
Playwright
```

Vitest should cover:

- pure domain logic;
- Prompt rendering;
- package validation;
- mention matching;
- alias and case rules;
- recursive discovery;
- context budgeting;
- API service behavior.

Playwright should cover browser workflows such as:

- creating a Project;
- creating and editing a Scene;
- opening the `/` menu;
- streaming generation;
- Accepting a generation;
- Rejecting a generation;
- Regenerating;
- clicking a Compendium underline;
- using Ctrl + Click;
- editing a Prompt Definition;
- changing a one-request model override;
- generating a premise.

### Linting and Formatting

The selected code-quality tool is:

```text
Biome
```

The repository should expose predictable project-wide commands for:

- type checking;
- linting;
- formatting checks;
- tests.

### Local Infrastructure

The selected local development infrastructure strategy is:

```text
Node applications run natively during development.

Docker Compose runs infrastructure services, initially PostgreSQL.
```

The preferred local workflow is conceptually:

```text
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm dev
```

The frontend and backend development servers should run with normal local hot-reload behavior.

## 29.12 Initial Deployment Strategy

The immediate deployment target is intentionally small-scale:

1. personal local use;
2. invite-only testing with a few trusted friends;
3. later public hosting if Asterism reaches that stage.

The architecture should be production-capable without requiring the first deployment to behave like a mature SaaS platform.

### Local Development and Personal Use

Initial development and personal testing should use:

```text
Browser
    ↓
Local React/Vite App
    ↓
Local Fastify API
    ↓
Local PostgreSQL
    ↓
OpenRouter
```

PostgreSQL should run locally through Docker Compose.

The frontend and API should run natively during development.

### Initial Hosted Deployment

The initial hosted deployment plan is:

```text
GitHub Monorepo
        │
        ├── apps/web
        │      ↓
        │   Vercel Project
        │
        └── apps/api
               ↓
            Vercel Project

Hosted PostgreSQL
        ↓
Neon
```

The web application and API should remain separate deployable applications even if both are initially hosted on Vercel.

This preserves the ability to move the API to another hosting environment later without redesigning the frontend.

### Deployment Profiles

The codebase should support the following profiles.

#### Local Development

```text
Web:
local Vite development server

API:
local Fastify server

Database:
local PostgreSQL through Docker Compose
```

#### Hosted Preview / Private Beta

```text
Web:
Vercel

API:
Vercel

Database:
non-production hosted PostgreSQL environment
```

Used for invite-only testing with trusted friends.

#### Production

```text
Web:
Vercel initially

API:
Vercel initially

Database:
production Neon PostgreSQL
```

The architecture should not permanently depend on Vercel-specific application logic.

### Future Self-Hosting

Self-hosting should remain architecturally possible but is not an immediate product feature.

A future self-hosted profile may use:

```text
Browser
    ↓
Asterism Web
    ↓
Asterism API
    ↓
PostgreSQL
```

running on user-controlled infrastructure.

A technical Docker Compose deployment path may be created later.

The MVP does not require polished NAS installers, one-click self-host setup, or desktop packaging.

### Offline Behavior

True offline-first synchronization is explicitly not an MVP requirement.

The near-term priorities are:

1. reliable autosave;
2. safe persistence;
3. revision-history foundations;
4. backups and exports.

Complex multi-device offline conflict resolution should be considered later.

## 29.13 Initial User, Workspace, and Authentication Model

The first real users are expected to be:

- the developer/owner;
- a small number of trusted testers.

The system should nevertheless use real per-user data ownership.

### Internal Domain Model

Internally:

```text
User
    ↓
Workspace
    ↓
Project
```

Every newly created user should receive a Personal Workspace automatically.

The Workspace concept does not need to be exposed prominently in the initial UI.

The initial UI may simply show:

```text
My Projects
```

while the internal ownership model remains future-compatible.

### Local Development Authentication

Local development may support a development-only authentication bypass.

Conceptually:

```text
Development Mode
        ↓
Seeded Local Developer User
        ↓
Default Personal Workspace
```

This should never silently apply to deployed production environments.

### Deployed Private Testing

Deployed testing should use real individual accounts.

The initial auth implementation should use:

```text
Better Auth
```

with a simple initial feature set.

The private testing phase should use invite-only or allowlisted registration rather than unrestricted public signup.

The initial permission model only needs to guarantee:

- a user can access their own Workspace and Projects;
- a user cannot access another user's private Projects.

Complex collaboration roles are not an MVP requirement.

## 29.14 Initial AI Credential Strategy

AI credential handling differs by environment.

### Local Development

Local development uses an environment-provided OpenRouter credential.

Conceptually:

```text
OPENROUTER_API_KEY=...
```

The backend reads the credential.

The frontend must not receive the secret.

### Private Testing

For the initial small private beta, the simplest model is a server-owned OpenRouter credential.

Conceptually:

```text
Tester
    ↓
Asterism API
    ↓
Server OpenRouter Credential
    ↓
OpenRouter
```

Basic request limits and usage logging should be available before inviting testers.

### Future BYOK

Bring Your Own Key support is a future capability, not an MVP requirement.

The architecture should avoid blocking future encrypted per-user provider credentials.

A future internal credential-resolution boundary may support:

```text
ManagedCredentialResolver
UserBYOKCredentialResolver
EnvironmentCredentialResolver
```

## 29.15 Configuration Resolution Precedence

Asterism repeatedly needs layered configuration.

The general precedence direction should be:

```text
Per-Request Override
        >
Workflow Setting
        >
Project Setting
        >
User Setting
        >
Built-In Default
```

Not every setting must expose every layer in the MVP.

For example, initial model selection may expose only:

```text
User Base Model
        ↓
Per-Request Override
```

The internal architecture should avoid assuming those will always be the only scopes.

This pattern may apply to:

- model selection;
- Prompt Definition selection;
- target generation length defaults;
- Smart Context settings;
- recursion depth;
- context-budget preferences.

---

# 30. Current Core Domain Model

```text
Project
├── Project Metadata
│   ├── Premise
│   ├── Genres
│   ├── Themes
│   └── Tags
│
├── Manuscript
│   └── Acts
│       └── Chapters
│           └── Scenes
│               └── Prose Content
│
├── Compendium
│   ├── System Entries or System Context
│   └── Story Entries
│
├── Prompt System
│   ├── Prompt Registry
│   ├── Built-In Prompt Definitions
│   ├── User Prompt Definitions
│   ├── Workflow Bindings
│   └── Prompt Variables
│
├── Definition Registry
│   ├── Genre Packs
│   ├── Theme Packs
│   ├── Tag Packs
│   ├── Compendium Type Definitions
│   └── Future Templates and Presets
│
└── AI Configuration
    ├── Base Model
    ├── Per-Request Model Override
    ├── Context Model
    ├── Generation Modes
    ├── Prompt Selection
    ├── Context Assembly
    └── Generation State
```

This model is provisional and should evolve as unresolved systems are specified.

---

# 31. Initial Functional Requirements

## 31.1 Manuscript Writing

The user can:

- create and navigate Acts, Chapters, and Scenes;
- enter and edit prose inside Scenes;
- place the cursor within Scene prose;
- invoke an inline AI command menu;
- select a prose-generation mode;
- provide optional instructions;
- see the configured Base Model as the default model;
- temporarily select another OpenRouter model for the current generation;
- request a target output length;
- choose words or paragraphs;
- stream generated prose into the editor;
- Accept the candidate;
- Reject the candidate;
- Regenerate with optional custom instructions.

## 31.2 Story Ideation

The user can:

- browse built-in Genres;
- browse built-in Themes;
- browse built-in General Tags;
- manually select values;
- enter free-form comma-separated values;
- randomly select values;
- enable or disable the Asterism Base Package;
- use custom reusable collections;
- see the Base Model as the default before premise generation;
- temporarily choose another model for a premise-generation request;
- generate a premise;
- edit the premise;
- regenerate or generate alternatives;
- retain metadata as part of the Project;
- optionally make premise metadata available to later AI operations.

## 31.3 Compendium

The user can:

- create entries;
- assign entry Types;
- add aliases;
- select activation mode;
- toggle case sensitivity;
- write entry content;
- see matching Compendium names and aliases underlined in supported story-text surfaces;
- click an underlined mention to inspect a compact entry view;
- use Ctrl + Click to open the referenced entry directly;
- allow mention-based activation;
- allow recursive candidate discovery;
- use Smart Context Extraction by default;
- disable Smart Context Extraction;
- use conventional retrieval as fallback.

Visual mention decoration remains available independently of whether an entry is configured as Mention, Always Active, or Never Active.

Future versions may additionally support:

- custom entry fields;
- field templates;
- explicit relationships;
- per-request forced inclusion;
- per-request exclusion;
- shared Compendiums;
- advanced Context Inspector tools.

## 31.4 Prompt Builder

The user can:

- browse available Prompt Definitions;
- filter prompts by compatible workflow;
- inspect built-in workflow prompts;
- duplicate a built-in prompt;
- create a new prompt;
- edit user-owned prompts;
- use workflow-specific variables;
- validate prompt templates;
- select a compatible prompt for a workflow;
- return a workflow to its default prompt.

The system can:

- load built-in prompts from data-driven definitions;
- resolve a workflow's designated default prompt;
- resolve user workflow overrides;
- validate prompt schemas;
- render workflow variables;
- preserve built-in defaults when users create modifications.

## 31.5 Data-Driven Packages and Definitions

The system can:

- load built-in Genre packs;
- load built-in Theme packs;
- load built-in Tag packs;
- load Prompt Definitions;
- validate package schemas;
- identify definitions through stable IDs;
- enable or disable eligible base packages;
- keep package definitions separate from project runtime data;
- support future import and export of compatible user packages.

## 31.6 Full-Stack Development Foundation

The application includes:

- frontend application;
- backend application or API;
- persistent local database;
- migrations;
- environment-based local configuration;
- AI-provider integration;
- streaming generation transport;
- documented local startup workflow;
- mockable model interfaces for tests.

## 31.7 Base Model Defaults and Overrides

The user can:

- configure a Base Model;
- use the Base Model automatically in prose generation;
- use the Base Model automatically in premise generation;
- use the Base Model automatically in summary generation;
- temporarily choose another model before an individual generation;
- keep a one-off model choice from silently changing the Base Model setting.

The Context Model remains a separate configuration role.

## 31.8 Default UI Direction

The default interface:

- uses a modern dark gray visual foundation;
- uses restrained yellow-to-orange accent colors;
- keeps the manuscript editor visually calm and uncluttered;
- uses compact contextual menus and popovers;
- relies on theme tokens or equivalent variables for major color roles.

Detailed UI specifications will be developed separately.

---

# 32. Major Open Design Questions

## 32.1 Scene Metadata

Can a Scene contain metadata such as:

- title;
- summary;
- POV character;
- location;
- characters present;
- Scene goal;
- notes;
- status.

This data could become important context-engine input.

## 32.2 Mid-Scene Generation

Can users generate at any cursor position inside existing prose?

If so:

- should the model see prose after the cursor?
- should Asterism support gap-filling behavior?
- how is temporary generation represented when inserted between existing content?

## 32.3 Rich Text Scope

Should Scene documents support:

- italics;
- bold;
- scene separators;
- comments;
- annotations;
- inline notes;
- footnotes;
- links to Compendium entries.

This will influence editor technology choices.

## 32.4 Command Interaction

Should `/` open a full small configuration panel, or should commands support faster defaults such as:

```text
/continue
```

with optional advanced expansion?

## 32.5 Remembered Defaults and Presets

Should generation modes remember:

- model;
- length;
- context settings;
- Smart Context settings.

Should users be able to save presets such as:

- Fast Draft;
- Important Emotional Scene;
- Long Descriptive Passage.

## 32.6 Prompt Builder Advanced Controls

The Prompt Builder itself is a required feature.

Remaining design questions include:

- Should advanced users be able to replace the entire message sequence?
- Should some workflow-critical wrapper instructions remain protected?
- Can a Prompt Definition recommend a model or model role?
- Can prompts inherit from other prompts?
- Should project-specific prompt overrides be supported in the MVP or later?
- Should prompt revision history be retained?
- How should users compare an older customized prompt against an updated built-in default?

## 32.7 Activation Scan Scope

What exactly is scanned for mention activation?

Possible sources:

- recent prose;
- entire current Scene;
- previous Scene;
- Event target;
- generation instructions;
- Scene metadata;
- recent-memory summaries.

These sources may need different weights.

## 32.8 Matching Semantics

Should alias matching enforce word boundaries?

Example alias:

```text
Ann
```

Should not accidentally match:

```text
Annabelle
announcement
```


Additional mention-decoration questions include:

- How should overlapping aliases be resolved?
- Should the longest valid match win automatically?
- How should underlining behave when multiple entries share the same alias?
- Should compact views be editable inline or reference-only?
- How aggressively should mention decoration update in very large documents?

## 32.9 Trigger Keywords

Should entries have trigger keywords separate from aliases?

Example:

```text
Entry: The Moon Plague

Aliases:
- Moon Plague
- Lunar Sickness

Trigger Keywords:
- silver lesions
- moon fever
- blackened eyes
```

## 32.10 Explicit Relationships

Should recursion be based on:

- text mention detection inside entries;
- explicit structured relationships;
- both.

Explicit relationships could support:

```text
Julia → sister_of → Rebecca
Julia → member_of → Blackthorn Society
Julia → lives_in → New York
```

## 32.11 Manual Inclusion and Exclusion

Can the user force an entry into context for one generation?

Can the user temporarily exclude an otherwise active entry?

## 32.12 Context Model Configuration

Who selects the small Context Model?

Possible scopes:

- Asterism default;
- global user setting;
- per-project;
- per-generation;
- automatic selection.

## 32.13 Empty Extraction Result

When an activated entry has no detailed relevant facts, should Asterism:

- send nothing;
- send identity only;
- send name/type/basic description;
- vary behavior by entry type.

## 32.14 Extraction Output Format

Should Smart Context output:

- verbatim fragments;
- structured fact identifiers;
- compressed summaries;
- a hybrid approach.

Fact or fragment selection is preferred for grounding.

## 32.15 Extraction Reuse

Should Smart Context run for every generation, or can extraction be reused between similar requests?

Potential cache boundaries:

- Scene revision;
- cursor region;
- generation mode;
- exact request.

## 32.16 Story State and Memory

How does Asterism know when facts change over time?

Example:

```text
Julia trusts Nora completely.
```

Later:

```text
Nora betrays Julia.
```

Possible approaches:

- manual Compendium updates;
- separate current-state memory;
- automatic Scene summaries;
- temporal facts;
- combinations of these.

This is one of the most important unresolved systems.

## 32.17 Automatic Memory Extraction

After a Scene is completed, a model could extract consequences:

```text
- Julia discovered Nora lied about the train station.
- Julia injured her left hand.
- The brass key is now in Julia's possession.
- Marcus believes Julia has left the city.
```

This could feed future generations without rewriting permanent Compendium canon.

## 32.18 Memory Update Timing

When should memory update?

Possible triggers:

- user marks Scene complete;
- user leaves Scene;
- prose changes;
- manual refresh only.

## 32.19 System Entry Semantics

What makes System context different from normal Compendium entries?

Questions:

- special prompt placement?
- no mention activation?
- generation-mode binding?
- project or global scope?
- user-created System Entries?
- templates?

## 32.20 Ideation Persistence

If a generated premise is heavily edited and no longer reflects a selected tag, should the tag remain active project metadata until manually removed?

## 32.21 Multiple Premise Generation

Should the ideation system support:

- generating several premises at once;
- favoriting;
- branching;
- combining parts of different premises;
- persistent generation history.

## 32.22 Project Scope and Shared Worlds

Is one Project always exactly one story?

Future questions include:

- multi-book series;
- shared universes;
- sequels;
- importing Compendium content;
- reusing a world across projects.

## 32.23 Shared Compendiums

Should Compendium knowledge be reusable across projects?

Possible future model:

```text
Workspace Compendium
        ↓
Project Compendium
        ↓
Project-Specific Overrides
```

This may affect schema design even if not included in the MVP.

## 32.24 Product Complexity Level

How technical should Asterism feel?

One extreme:

> Write your story. Asterism handles context automatically.

The other:

> Choose context budgets, recursion depth, source weights, extraction model, token allocation, prompts, and insertion priority.

A likely approach is simple defaults with an Advanced mode.

## 32.25 Cost Visibility

Should the UI show:

- estimated generation cost;
- actual generation cost;
- project total;
- model comparisons;
- Context Model cost separately.

## 32.26 Model Roles

The MVP should support a Base Model for ordinary user-facing generation workflows and an independently configurable Context Model.

Longer-term questions include whether Asterism should additionally expose distinct specialized model roles such as:

- Summarization Model;
- Brainstorming Model;
- Memory Extraction Model.

The main design question is whether these roles should override the Base Model automatically or remain optional advanced configuration.

The scope of the Base Model setting also remains open:

- global user setting only;
- project-level override;
- workflow-level default layered beneath per-request overrides.

## 32.27 Package Distribution

Should user-created Genre, Theme, Tag, Prompt, and Compendium-template packs eventually be shareable as installable packages?

Questions include:

- package signing or trust indicators;
- compatibility checks;
- dependency handling;
- update behavior;
- package-level enable and disable controls.

## 32.28 Deployment Follow-Up Questions

The initial deployment direction is now decided:

- local development and personal use first;
- Vercel for the initial hosted web and API deployments;
- Neon PostgreSQL for hosted persistence;
- real user accounts for deployed private testing;
- hidden Personal Workspaces internally;
- invite-only or allowlisted private testing;
- no true offline-first synchronization requirement for the MVP;
- self-hosting kept architecturally possible but not prioritized as a polished initial product feature.

Remaining questions include:

- whether the API should remain on Vercel after usage grows;
- when to introduce public registration;
- when to introduce BYOK credentials;
- whether project-level Base Model overrides should be exposed;
- what revision-history guarantees are required before public beta;
- what backup and export guarantees should be provided before public hosting;
- when self-hosted distribution should become an officially supported path.

---

# 33. Highest-Priority Unresolved Questions

The following questions have the greatest remaining architectural impact:

1. **How do story facts change over time, and how is recent memory handled?**
2. **What exactly is scanned for mention activation?**
3. **Are relationships explicit structured links, text-detected references, or both?**
4. **What is genuinely special about a System Compendium Entry?**
5. **Can Compendium knowledge be shared across multiple Projects or stories?**
6. **How much low-level control should the Prompt Builder expose while still protecting workflow invariants?**
7. **What revision-history, backup, and recovery guarantees are required before broader public use?**

These decisions should be resolved as the data model, Context Engine, Prompt System, and persistence model are finalized.

---

# 34. MVP Direction

A reasonable initial MVP scope based on the design so far is:

## Manuscript

- Project → Act → Chapter → Scene hierarchy.
- Scene-based prose editor.
- Inline `/` command menu.
- Start Writing.
- Continue Writing.
- Continue Toward Event.
- Optional instructions.
- Base Model shown as the default generation model.
- Per-generation model override in the `/` menu.
- Word or paragraph length targets.
- Streaming temporary generation.
- Accept, Reject, Regenerate.

## Ideation

- Built-in Genres.
- Built-in Themes.
- Built-in General Tags.
- Free-form comma-separated values.
- Random selection.
- Base Model as the default premise-generation model.
- Easy per-request model override.
- Premise generation.
- Editable premise.
- Alternative generation.
- Disableable Asterism Base Package.

## Compendium

- Name.
- Type.
- Aliases.
- Activation mode.
- Case sensitivity.
- Single main Content field for MVP.
- Mention activation.
- Always Active.
- Never Active.
- Name and alias underlining in practically relevant story-text surfaces.
- Compact entry preview on click.
- Direct entry opening with Ctrl + Click.
- Visual mention decoration independent of AI activation mode.
- Recursive candidate discovery with depth limit.
- Smart Context Extraction enabled by default.
- User-configurable Context Model.
- Smart mode disable option.
- Conventional retrieval fallback.
- Context budgeting.

## Prompt Builder

- Data-driven Prompt Definitions.
- One designated default prompt for every implemented AI workflow.
- Prompt Registry with stable workflow keys.
- Built-in prompt inspection.
- Duplicate built-in prompt into a user-owned prompt.
- Create and edit user prompts.
- Workflow compatibility metadata.
- Workflow variable insertion.
- Prompt validation.
- Per-workflow prompt selection.
- Restore default prompt binding.

## Data-Driven Foundation

- JSON or equivalent structured definitions for built-in prompt definitions.
- Data-driven built-in Genre, Theme, and Tag packs.
- Stable IDs and schema versions.
- Validation on package load.
- Shared logical contracts for built-in and user-extensible definitions where practical.

## Full-Stack Foundation

- TypeScript strict mode across frontend and backend.
- Node.js 24 LTS runtime.
- pnpm monorepo.
- Turborepo task orchestration.
- React + Vite frontend.
- TanStack Router.
- TanStack Query.
- Zustand for limited local UI state.
- Tiptap manuscript editor.
- Floating UI for appropriate contextual interfaces.
- Tailwind CSS.
- shadcn/ui.
- React Hook Form for ordinary forms.
- Zod validation and shared schemas.
- Fastify backend.
- PostgreSQL database.
- Drizzle ORM and Drizzle Kit.
- Custom Asterism AI provider abstraction.
- OpenRouter provider implementation.
- FakeAIProvider for deterministic testing.
- Vitest.
- Playwright.
- Biome.
- Local PostgreSQL through Docker Compose.
- Persistent database from the initial implementation.
- Local migrations.
- Local environment configuration.
- Secure server-side AI-provider integration.
- Streaming backend-to-frontend generation transport.
- Documented local developer startup path.
- Mockable AI-provider interfaces for tests.

## Initial Deployment and Tester Model

- Personal local use first.
- Vercel as the initial hosted frontend platform.
- Vercel as the initial hosted Fastify API platform.
- Neon PostgreSQL for hosted persistence.
- Separate `web` and `api` deployable applications.
- Local PostgreSQL for normal development.
- Separate local, preview/private-beta, and production environments.
- Better Auth for deployed accounts.
- Development-only seeded local-user bypass.
- Automatic hidden Personal Workspace per user.
- Invite-only or allowlisted private testing.
- Server-owned OpenRouter credential for the earliest trusted-test phase.
- Basic request limits and usage logging before tester access.
- BYOK support deferred but not architecturally blocked.
- True offline-first synchronization deferred.
- Self-hosting kept as a future supported direction rather than an initial polished product feature.

## Model Defaults

- User-configurable Base Model.
- Base Model used by default for prose generation.
- Base Model used by default for premise generation.
- Base Model used by default for summary generation.
- Easy per-request model overrides.
- Context Model configured separately from the Base Model.

## Visual Foundation

- Dark gray default interface.
- Modern, sleek visual direction.
- Yellow-to-orange accent family.
- Calm manuscript-writing surface.
- Theme-token-based implementation for future UI evolution.

## Architecture Preparation for Later Features

Even if not exposed in the first MVP, the internal architecture should avoid blocking:

- custom Compendium fields;
- field templates;
- explicit entry relationships;
- automatic memory;
- temporal story state;
- per-request context pinning and exclusion;
- shared Compendiums;
- Context Inspector;
- user-created System Entries;
- generation presets;
- model-role configuration;
- project-specific Prompt Definitions;
- prompt revision history;
- shareable definition packages;
- package dependency management.

---

# 35. Summary

Asterism is an AI-assisted fiction-writing environment centered around four connected product systems and a data-driven full-stack foundation:

1. **The Manuscript**, where users write prose inside a Project → Act → Chapter → Scene hierarchy.
2. **The Ideation System**, where Genres, Themes, and flexible Tags can be combined to generate editable story premises.
3. **The Smart Compendium**, which stores persistent story knowledge and intelligently filters relevant information before passing context to the Writing Model.
4. **The Prompt System**, where every AI workflow resolves a designated data-driven Prompt Definition that users can inspect, duplicate, modify, create, and assign through an in-app Prompt Builder.

Built-in packages, prompt definitions, tag libraries, and similar extensible content should be data-driven wherever practical, preferably through versioned JSON or equivalent schema-driven definitions.

The application should be implemented as full-stack from the beginning, with a complete local development environment, persistent storage, backend orchestration, secure provider integration, and streaming support.

The selected implementation baseline is a TypeScript monorepo using pnpm and Turborepo, with a React/Vite frontend, TanStack Router, TanStack Query, limited Zustand UI state, Tiptap for manuscript editing, Tailwind CSS and shadcn/ui for interface construction, Zod for validation, Fastify for the backend, PostgreSQL with Drizzle for persistence, and a Asterism-owned AI provider abstraction using OpenRouter initially. Vitest, Playwright, Biome, and Docker Compose form the initial testing, tooling, and local-infrastructure baseline.

The immediate deployment path is personal local use first, followed by an invite-only private beta. The initial hosted plan uses separate Vercel deployments for the web and API applications with Neon PostgreSQL for hosted persistence. Deployed testers receive real accounts and hidden Personal Workspaces, while collaboration, public registration, true offline synchronization, polished self-hosting, and BYOK credentials remain later concerns.

Compendium names and aliases should form a navigable visual layer throughout relevant story text. Matching mentions are underlined independently of AI activation settings, can show a compact entry preview when clicked, and can open the full entry directly with Ctrl + Click.

User-facing AI workflows should default to a configurable Base Model while allowing easy per-request model overrides. The Smart Context model remains separately configurable.

The initial visual direction is a sleek dark gray interface with restrained yellow-to-orange accents, while detailed UI design remains a later dedicated design phase.

The defining architectural distinction is that Asterism does not only retrieve relevant entries. It also attempts to retrieve only the relevant information inside those entries.

The target pipeline is:

```text
Manuscript Context
        +
Generation Request
        +
Compendium Candidate Discovery
        +
Recent Narrative Memory
        ↓
Smart Context Extraction
        ↓
Context Budgeting
        ↓
Final Prompt Assembly
        ↓
Writing Model
        ↓
Streaming Temporary Generation
        ↓
Accept / Reject / Regenerate
```

The remaining major design work is centered around:

- narrative memory and changing story state;
- exact mention-scanning scope;
- explicit versus text-derived relationships;
- System Compendium semantics;
- project and shared-world scope;
- advanced context controls;
- Prompt Builder advanced-control boundaries;
- revision history, backups, and recovery guarantees;
- editor details and generation UX.

These areas should be resolved as the data model, Context Engine, prompt system, and deployment architecture are finalized.
