import type { CompendiumEntry } from "@skriv/contracts";
import { describe, expect, it } from "vitest";
import { compendiumMentionSegments } from "./mentions.js";

function entry(name: string): CompendiumEntry {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    typeId: "story.character",
    name,
    aliases: [],
    labels: [],
    imageDataUrl: null,
    activationMode: "mention",
    trackingEnabled: true,
    caseSensitive: false,
    matchExclusions: [],
    content: { kind: "text", text: "" },
    revision: 1,
    singleton: false,
    createdAt: now,
    updatedAt: now,
  };
}

describe("compendiumMentionSegments", () => {
  it("provides the same lossless text segments to editable and read-only renderers", () => {
    const zebe = entry("Zebe");
    const miranda = entry("Miranda");
    const text = "Zebe met Miranda upstairs.";
    const segments = compendiumMentionSegments(text, [zebe, miranda]);

    expect(segments.map((segment) => segment.text).join("")).toBe(text);
    expect(
      segments
        .filter((segment) => segment.kind === "mention")
        .map((segment) => [segment.text, segment.entryIds]),
    ).toEqual([
      ["Zebe", [zebe.id]],
      ["Miranda", [miranda.id]],
    ]);
  });
});
