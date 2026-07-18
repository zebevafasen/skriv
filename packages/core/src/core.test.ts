import type { CompendiumEntry, ManuscriptTree, PromptDefinition, Scene } from "@skriv/contracts";
import { describe, expect, it } from "vitest";
import {
  discoverEntries,
  discoverReferences,
  findMentions,
  formatCompendiumFragments,
  formatCompendiumReferences,
  manuscriptLabels,
  planCompendiumContext,
  renderPrompt,
  sceneCompendiumEntryIds,
  segmentEntry,
  validatePromptDefinition,
} from "./index.js";

function labelScene(title: string): Scene {
  return {
    id: crypto.randomUUID(),
    chapterId: crypto.randomUUID(),
    title,
    position: 0,
    document: { type: "doc", content: [{ type: "paragraph" }] },
    plainText: "",
    version: 1,
    metadata: {
      summary: "",
      povEntryId: null,
      locationEntryId: null,
      presentCharacterEntryIds: [],
      manualCompendiumEntryIds: [],
      goal: "",
      notes: "",
      status: "draft",
      labels: [],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const entry = (
  overrides: Partial<CompendiumEntry> & Pick<CompendiumEntry, "id" | "name">,
): CompendiumEntry => ({
  id: overrides.id,
  name: overrides.name,
  projectId: overrides.projectId ?? crypto.randomUUID(),
  typeId: overrides.typeId ?? "story.character",
  aliases: overrides.aliases ?? [],
  labels: overrides.labels ?? [],
  imageDataUrl: overrides.imageDataUrl ?? null,
  activationMode: overrides.activationMode ?? "mention",
  trackingEnabled: overrides.trackingEnabled ?? true,
  caseSensitive: overrides.caseSensitive ?? false,
  matchExclusions: overrides.matchExclusions ?? [],
  content: overrides.content ?? { kind: "text", text: "" },
  revision: overrides.revision ?? 1,
  singleton: overrides.singleton ?? false,
  createdAt: overrides.createdAt ?? new Date().toISOString(),
  updatedAt: overrides.updatedAt ?? new Date().toISOString(),
});

describe("mention matching", () => {
  it("can include untracked entries for explicit chat mentions", () => {
    const hidden = entry({
      id: crypto.randomUUID(),
      name: "Cedora",
      trackingEnabled: false,
      activationMode: "never",
    });
    expect(findMentions("Ask about Cedora", [hidden])).toHaveLength(0);
    expect(
      findMentions("Ask about Cedora", [hidden], { includeUntracked: true })[0]?.entryIds,
    ).toEqual([hidden.id]);
  });
  it("uses boundaries and longest-match precedence", () => {
    const ann = entry({ id: crypto.randomUUID(), name: "Ann" });
    const anna = entry({ id: crypto.randomUUID(), name: "Anna Bell" });
    expect(
      findMentions("announcement Ann met Anna Bell", [ann, anna]).map((match) => match.text),
    ).toEqual(["Ann", "Anna Bell"]);
  });

  it("matches phrase whitespace inserted by contenteditable editors", () => {
    const harbor = entry({
      id: crypto.randomUUID(),
      name: "New Harbor City",
      aliases: ["New Harbor"],
    });

    expect(findMentions("New Harbor\u00a0City", [harbor])).toEqual([
      expect.objectContaining({
        from: 0,
        to: 15,
        text: "New Harbor\u00a0City",
        entryIds: [harbor.id],
      }),
    ]);
  });

  it("keeps ambiguous entry identities", () => {
    const entries = [
      entry({ id: crypto.randomUUID(), name: "The Captain", aliases: ["Ash"] }),
      entry({ id: crypto.randomUUID(), name: "Ash Tree", aliases: ["Ash"] }),
    ];
    expect(findMentions("Ash waited.", entries)[0]?.entryIds).toHaveLength(2);
  });

  it("honors disabled tracking and phrase exclusions", () => {
    const hidden = entry({ id: crypto.randomUUID(), name: "Nora", trackingEnabled: false });
    const ash = entry({
      id: crypto.randomUUID(),
      name: "Ash",
      matchExclusions: ["Ash Tree"],
    });
    expect(findMentions("Nora stood by the Ash Tree. Ash waited.", [hidden, ash])).toEqual([
      expect.objectContaining({ text: "Ash", from: 28 }),
    ]);
  });
});

describe("manuscript labels", () => {
  it("numbers Chapters and Scenes globally while preserving optional titles", () => {
    const projectId = crypto.randomUUID();
    const first = labelScene("");
    const second = labelScene("The Return");
    const tree: ManuscriptTree = {
      project: {
        id: projectId,
        title: "Story",
        settings: {
          author: "",
          series: "",
          seriesIndex: "",
          coverDataUrl: null,
          tense: "Past",
          language: "General English",
          povType: "3rd Person (Limited)",
          povCharacterEntryId: null,
          notes: "",
          labelPacks: [],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      acts: [
        {
          id: crypto.randomUUID(),
          projectId,
          title: "",
          position: 0,
          chapters: [
            {
              id: first.chapterId,
              actId: crypto.randomUUID(),
              title: "Beginning",
              position: 0,
              scenes: [first],
            },
          ],
        },
        {
          id: crypto.randomUUID(),
          projectId,
          title: "Finale",
          position: 1,
          chapters: [
            {
              id: second.chapterId,
              actId: crypto.randomUUID(),
              title: "",
              position: 0,
              scenes: [second],
            },
          ],
        },
      ],
    };
    const labels = manuscriptLabels(tree);
    expect(labels.chapters.get(second.chapterId)?.label).toBe("Chapter 2");
    expect(labels.scenes.get(second.id)?.label).toBe("Scene 2: The Return");
    expect(labels.acts.get(tree.acts[1]?.id ?? "")?.label).toBe("Act 2: Finale");
  });
});

describe("context discovery", () => {
  it("normalizes Scene Compendium presence when older metadata omits array fields", () => {
    expect(sceneCompendiumEntryIds({})).toEqual([]);
    expect(
      sceneCompendiumEntryIds({
        povEntryId: "pov",
        locationEntryId: "location",
      }),
    ).toEqual(["pov", "location"]);
  });

  it("discovers recursive references and excludes never-active entries", () => {
    const nora = entry({
      id: crypto.randomUUID(),
      name: "Nora",
      content: { kind: "text", text: "A trusted investigator." },
    });
    const julia = entry({
      id: crypto.randomUUID(),
      name: "Julia",
      content: { kind: "text", text: "Julia trusts Nora." },
    });
    const secret = entry({ id: crypto.randomUUID(), name: "Secret", activationMode: "never" });
    const found = discoverEntries({
      entries: [julia, nora, secret],
      scanText: "Julia entered.",
      maxDepth: 2,
    });
    expect(found.map((item) => item.entry.name)).toEqual(["Julia", "Nora"]);
    expect(segmentEntry(found[0] as (typeof found)[number])[0]?.id).toContain(julia.id);
  });

  it("only exposes smart entries as extractor candidates when requested", () => {
    const smart = entry({
      id: crypto.randomUUID(),
      name: "The Glass Sea",
      activationMode: "smart",
      content: { kind: "text", text: "A dangerous inland ocean." },
    });
    expect(discoverEntries({ entries: [smart], scanText: "No exact reference." })).toEqual([]);
    expect(
      discoverEntries({
        entries: [smart],
        scanText: "No exact reference.",
        includeSmartCandidates: true,
      })[0],
    ).toEqual(expect.objectContaining({ activationSource: "smart", priority: 40 }));
  });

  it("resolves untracked direct references and recurses from them", () => {
    const nora = entry({ id: crypto.randomUUID(), name: "Nora" });
    const julia = entry({
      id: crypto.randomUUID(),
      name: "Julia",
      trackingEnabled: false,
      aliases: ["Jules"],
      content: { kind: "text", text: "Jules trusts Nora." },
    });
    const found = discoverReferences({ entries: [julia, nora], scanText: "Ask Jules for help." });
    expect(found.map((item) => [item.entry.name, item.referenceSource])).toEqual([
      ["Julia", "mentioned"],
      ["Nora", "recursive"],
    ]);
  });

  it("keeps Never include as a mention boundary but allows a deliberate pin", () => {
    const secret = entry({
      id: crypto.randomUUID(),
      name: "The Secret",
      trackingEnabled: false,
      activationMode: "never",
    });
    expect(discoverReferences({ entries: [secret], scanText: "Use The Secret." })).toEqual([]);
    expect(
      discoverReferences({
        entries: [secret],
        scanText: "",
        pinnedEntryIds: [secret.id],
      })[0],
    ).toEqual(expect.objectContaining({ entry: secret, referenceSource: "pinned" }));
  });

  it("plans deliberate AI-input mentions as fixed context even when automatic tracking is off", () => {
    const nora = entry({
      id: crypto.randomUUID(),
      name: "Nora",
      content: { kind: "text", text: "A trusted investigator." },
    });
    const julia = entry({
      id: crypto.randomUUID(),
      name: "Julia",
      aliases: ["Jules"],
      trackingEnabled: false,
      activationMode: "smart",
      content: { kind: "text", text: "Jules trusts Nora." },
    });
    const plan = planCompendiumContext({
      entries: [julia, nora],
      scanText: "",
      referenceText: "Ask Jules to investigate.",
      includeSmartCandidates: true,
      maxDepth: 2,
    });
    expect(plan.fixedFragments.map((fragment) => fragment.entryId)).toEqual([julia.id, nora.id]);
    expect(plan.smartFragments).toEqual([]);
  });

  it("uses scene associations in the same default plan while preserving Never include", () => {
    const present = entry({
      id: crypto.randomUUID(),
      name: "Present",
      trackingEnabled: false,
      content: { kind: "text", text: "Present at the current scene." },
    });
    const secret = entry({
      id: crypto.randomUUID(),
      name: "Secret",
      activationMode: "never",
    });
    const plan = planCompendiumContext({
      entries: [present, secret],
      scanText: "",
      scenePresenceEntryIds: [present.id, secret.id],
    });
    expect(plan.fixedFragments.map((fragment) => fragment.entryId)).toEqual([present.id]);
  });

  it("formats references and generation fragments through shared context formatters", () => {
    const julia = entry({
      id: crypto.randomUUID(),
      name: "Julia",
      content: { kind: "text", text: "A cartographer." },
    });
    const references = discoverReferences({ entries: [julia], scanText: "Ask Julia." });
    const plan = planCompendiumContext({ entries: [julia], scanText: "Julia arrived." });
    expect(formatCompendiumReferences(references)).toContain("[Entry Name: Julia]");
    expect(formatCompendiumFragments(plan.fixedFragments)).toContain("[Source: Julia;");
  });
});

describe("prompt registry primitives", () => {
  const prompt: PromptDefinition = {
    id: "test",
    name: "Test",
    workflow: "prose.continue",
    version: 1,
    description: "",
    ownership: "builtin",
    sourcePromptId: null,
    messages: [{ role: "user", content: "After: {{manuscript_after_cursor}}" }],
    variables: ["manuscript_after_cursor"],
    createdAt: null,
    updatedAt: null,
  };

  it("renders controlled variables", () => {
    expect(renderPrompt(prompt, { manuscript_after_cursor: "Hello" })[0]?.content).toBe(
      "After: Hello",
    );
  });

  it("rejects unknown variables", () => {
    expect(
      validatePromptDefinition({
        ...prompt,
        messages: [{ role: "user", content: "{{mystery}}" }],
        variables: ["mystery"],
      }),
    ).toHaveLength(2);
  });
});
