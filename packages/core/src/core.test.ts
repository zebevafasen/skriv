import type { CompendiumEntry, PromptDefinition } from "@asterism/contracts";
import { describe, expect, it } from "vitest";
import {
  discoverEntries,
  findMentions,
  renderPrompt,
  segmentEntry,
  validatePromptDefinition,
} from "./index.js";

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
  it("uses boundaries and longest-match precedence", () => {
    const ann = entry({ id: crypto.randomUUID(), name: "Ann" });
    const anna = entry({ id: crypto.randomUUID(), name: "Anna Bell" });
    expect(
      findMentions("announcement Ann met Anna Bell", [ann, anna]).map((match) => match.text),
    ).toEqual(["Ann", "Anna Bell"]);
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

describe("context discovery", () => {
  it("discovers recursive references and excludes never-active entries", () => {
    const nora = entry({ id: crypto.randomUUID(), name: "Nora" });
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
});

describe("prompt registry primitives", () => {
  const prompt: PromptDefinition = {
    id: "test",
    name: "Test",
    workflow: "prose.continue",
    version: 1,
    description: "",
    ownership: "builtin",
    ownerId: null,
    sourcePromptId: null,
    messages: [{ role: "user", content: "Before: {{manuscript_before_cursor}}" }],
    variables: ["manuscript_before_cursor"],
    createdAt: null,
    updatedAt: null,
  };

  it("renders controlled variables", () => {
    expect(renderPrompt(prompt, { manuscript_before_cursor: "Hello" })[0]?.content).toBe(
      "Before: Hello",
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
