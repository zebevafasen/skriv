import { describe, expect, it } from "vitest";
import { mentionActivatedEntryIds } from "./routes/chat.js";
import { removeIngredientPackOnlyValues } from "./routes/setup.js";

describe("project ingredient pack cleanup", () => {
  it("removes unique values and preserves overlaps and unrelated values", () => {
    const values = [
      { definitionId: "unique", label: "Unique" },
      { definitionId: "shared", label: "Shared" },
      { definitionId: "manual", label: "Manual" },
      { definitionId: null, label: "Freeform" },
    ];
    expect(
      removeIngredientPackOnlyValues(
        values,
        new Set(["unique", "shared"]),
        new Set(["shared"]),
      ),
    ).toEqual(values.slice(1));
  });
});

describe("Chat Compendium activation", () => {
  it("treats Smart like Mention while leaving Always and Never to their normal rules", () => {
    const mentionId = crypto.randomUUID();
    const smartId = crypto.randomUUID();
    const entries = [
      { id: mentionId, activationMode: "mention" as const },
      { id: smartId, activationMode: "smart" as const },
      { id: crypto.randomUUID(), activationMode: "always" as const },
      { id: crypto.randomUUID(), activationMode: "never" as const },
    ];
    const activated = mentionActivatedEntryIds(entries, new Set(entries.map((entry) => entry.id)));
    expect([...activated]).toEqual([mentionId, smartId]);
  });
});
