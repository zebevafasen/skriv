import { describe, expect, it } from "vitest";
import { formatProtectedPlanningContext } from "./routes/generation.js";

const metadata = (summary: string) => ({
  summary,
  povEntryId: null,
  locationEntryId: null,
  presentCharacterEntryIds: [],
  goal: "",
  notes: "",
  status: "draft" as const,
  labels: [{ id: crypto.randomUUID(), text: "Private label", color: "amber" as const }],
});

describe("protected planning context", () => {
  it("includes the immediate previous summary but excludes organizational labels", () => {
    const message = formatProtectedPlanningContext(
      { title: "Current", metadata: metadata("Current plan") },
      { title: "Previous", metadata: metadata("Prior consequence") },
    );
    expect(message.content).toContain("Prior consequence");
    expect(message.content).toContain("Current plan");
    expect(message.content).not.toContain("Private label");
  });
});
