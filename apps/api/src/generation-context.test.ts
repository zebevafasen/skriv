import { basePackage } from "@asterism/content";
import { renderPrompt } from "@asterism/core";
import { describe, expect, it } from "vitest";

describe("prose prompt context", () => {
  it("uses explicit project data and excludes manuscript organization and outline fields", () => {
    for (const prompt of basePackage.prompts.filter((item) => item.workflow.startsWith("prose."))) {
      const messages = renderPrompt(prompt, {
        context_package: "Canonical compendium fact",
        prior_scene_summaries: "Allowed earlier summary",
        previous_scene_excerpt: "Previous canonical prose",
        manuscript_before_cursor: "Recent canonical prose",
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
});
