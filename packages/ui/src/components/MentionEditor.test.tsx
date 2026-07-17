import type { CompendiumEntry } from "@skriv/contracts";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MentionEditor } from "./MentionEditor.js";

const roots: Array<ReturnType<typeof createRoot>> = [];

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

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.length = 0;
});

describe("MentionEditor", () => {
  it("uses the shared Tiptap mention decorations for controlled plain text", () => {
    const zebe = entry("Zebe");
    const miranda = entry("Miranda");
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <MentionEditor
          entries={[zebe, miranda]}
          onValueChange={() => undefined}
          value={"Zebe waited.\nMiranda arrived."}
        />,
      );
    });

    expect(
      [...container.querySelectorAll(".compendium-mention")].map((node) => node.textContent),
    ).toEqual(["Zebe", "Miranda"]);
    expect(container.querySelectorAll(".ProseMirror > p")).toHaveLength(2);

    act(() => {
      root.render(
        <MentionEditor
          entries={[zebe, miranda]}
          onValueChange={() => undefined}
          value="Miranda stayed."
        />,
      );
    });

    expect(container.querySelectorAll(".compendium-mention")).toHaveLength(1);
    expect(container.querySelector(".compendium-mention")?.textContent).toBe("Miranda");
  });

  it("survives route-style unmounting and remounting in Strict Mode", () => {
    const zebe = entry("Zebe");
    const container = document.createElement("div");
    const root = createRoot(container);
    roots.push(root);
    const render = (visible: boolean, value: string) => {
      root.render(
        <StrictMode>
          {visible ? (
            <MentionEditor entries={[zebe]} onValueChange={() => undefined} value={value} />
          ) : null}
        </StrictMode>,
      );
    };

    act(() => render(true, "Zebe waited."));
    act(() => render(false, ""));
    act(() => render(true, "Zebe returned."));

    expect(container.querySelector(".compendium-mention")?.textContent).toBe("Zebe");
  });
});
