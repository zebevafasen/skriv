import { basePackage } from "@asterism/content";
import { renderPrompt } from "@asterism/core";
import { describe, expect, it } from "vitest";
import { recentSummaryContext } from "./routes/generation.js";

describe("prose prompt context", () => {
  it("uses explicit project data and excludes manuscript organization and outline fields", () => {
    for (const prompt of basePackage.prompts.filter((item) => item.workflow.startsWith("prose."))) {
      const messages = renderPrompt(prompt, {
        context_package: "Canonical compendium fact",
        current_scene_summary: "Allowed current summary",
        prior_scene_summaries: "Allowed earlier summary",
        style_reference_prose: "Closest canonical prose",
        manuscript_after_cursor: "Following canonical prose",
        event_target: "The door opens",
        user_instructions: "Keep the tension high",
        target_length: "500 words",
        story_tense: "Past",
        story_language: "British English",
        story_pov: "3rd Person (Limited)",
        pov_character: "Mara",
      });
      const rendered = messages.map((message) => message.content).join("\n");
      expect(rendered).toContain("Past tense");
      expect(rendered).toContain("British English");
      expect(rendered).toContain("3rd Person (Limited)");
      expect(rendered).toContain("Mara");
      expect(rendered).toContain("Allowed current summary");
      expect(rendered).toContain("Allowed earlier summary");
      expect(rendered).toContain("Closest canonical prose");
      for (const forbidden of [
        "Act title",
        "Chapter title",
        "Scene title",
        "Private goal",
        "Private note",
        "Private label",
      ]) {
        expect(rendered).not.toContain(forbidden);
      }
    }
  });

  it("keeps the newest summaries within the context budget and preserves their order", () => {
    const summaries = ["oldest".repeat(2_000), "middle".repeat(1_000), "newest"];
    const result = recentSummaryContext(summaries);
    expect(result).not.toContain("oldest");
    expect(result.indexOf("middle")).toBeLessThan(result.indexOf("newest"));
  });
});
