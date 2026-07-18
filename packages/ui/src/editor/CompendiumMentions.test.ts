import type { CompendiumEntry } from "@skriv/contracts";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CompendiumMentions,
  compendiumMentionClick,
  setCompendiumMentionEntries,
} from "./CompendiumMentions.js";

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

afterEach(() => vi.useRealTimers());

describe("CompendiumMentions", () => {
  it("decorates initial and edited Tiptap text through one shared adapter", () => {
    const zebe = entry({ id: crypto.randomUUID(), name: "Zebe" });
    const element = document.createElement("div");
    const editor = new Editor({
      element,
      extensions: [StarterKit, CompendiumMentions.configure({ entries: [zebe] })],
      content: "<p>Zebe waited.</p>",
    });

    const initial = element.querySelector<HTMLElement>(".compendium-mention");
    expect(initial?.textContent).toBe("Zebe");
    expect(initial?.tagName).toBe("MARK");
    expect(initial?.dataset.entryIds).toBe(zebe.id);
    let click: ReturnType<typeof compendiumMentionClick>;
    initial?.addEventListener("click", (event) => {
      click = compendiumMentionClick(event);
    });
    initial?.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    expect(click).toEqual({ entryIds: [zebe.id], direct: true });

    editor.commands.setContent("<p>No match.</p>");
    expect(element.querySelector(".compendium-mention")).toBeNull();
    editor.commands.setContent("<p>Zebe returned.</p>");
    expect(element.querySelector(".compendium-mention")?.textContent).toBe("Zebe");
    editor.destroy();
  });

  it("refreshes immediately when the available Compendium entries change", () => {
    const zebe = entry({ id: crypto.randomUUID(), name: "Zebe" });
    const miranda = entry({ id: crypto.randomUUID(), name: "Miranda" });
    const element = document.createElement("div");
    const editor = new Editor({
      element,
      extensions: [StarterKit, CompendiumMentions.configure({ entries: [zebe] })],
      content: "<p>Zebe met Miranda.</p>",
    });

    expect(element.querySelector(".compendium-mention")?.textContent).toBe("Zebe");
    setCompendiumMentionEntries(editor, [miranda]);
    expect(element.querySelector(".compendium-mention")?.textContent).toBe("Miranda");
    editor.destroy();
  });

  it("underlines one visible mention consistently across adjacent rich-text nodes", () => {
    const harbor = entry({ id: crypto.randomUUID(), name: "New Harbor City" });
    const element = document.createElement("div");
    const editor = new Editor({
      element,
      extensions: [StarterKit, CompendiumMentions.configure({ entries: [harbor] })],
      content: "<p>New Harbor <strong>City</strong></p>",
    });

    const decorated = [...element.querySelectorAll<HTMLElement>(".compendium-mention")];
    expect(decorated.map((node) => node.textContent).join("")).toBe("New Harbor City");
    expect(new Set(decorated.map((node) => node.dataset.entryIds))).toEqual(new Set([harbor.id]));
    editor.destroy();
  });

  it("can debounce rescanning large editor documents", () => {
    vi.useFakeTimers();
    const zebe = entry({ id: crypto.randomUUID(), name: "Zebe" });
    const element = document.createElement("div");
    const editor = new Editor({
      element,
      extensions: [StarterKit, CompendiumMentions.configure({ entries: [zebe], debounceMs: 100 })],
      content: "<p>No match.</p>",
    });

    editor.commands.setContent("<p>Zebe returned.</p>");
    expect(element.querySelector(".compendium-mention")).toBeNull();
    vi.advanceTimersByTime(100);
    expect(element.querySelector(".compendium-mention")?.textContent).toBe("Zebe");
    editor.destroy();
  });
});
