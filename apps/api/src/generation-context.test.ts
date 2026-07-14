import { basePackage } from "@asterism/content";
import { renderPrompt } from "@asterism/core";
import { describe, expect, it } from "vitest";
import {
  continuationMessages,
  firstSceneGenerationEligible,
  proseContextRows,
  proseOutputTokenBudget,
  recentSummaryContext,
  trimRepeatedBoundary,
} from "./routes/generation.js";

describe("prose prompt context", () => {
  it("uses explicit project data and excludes manuscript organization and outline fields", () => {
    for (const prompt of basePackage.prompts.filter(
      (item) => item.workflow.startsWith("prose.") && item.workflow !== "prose.first_scene",
    )) {
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

  it("renders the premise and opening plan only for the dedicated first-Scene prompt", () => {
    const prompt = basePackage.prompts.find((item) => item.workflow === "prose.first_scene");
    expect(prompt).toBeDefined();
    if (!prompt) throw new Error("First-Scene prompt not found.");
    const rendered = renderPrompt(prompt, {
      premise: "Mara enters the Glass Archive to recover a stolen memory.",
      context_package: "Mara is an investigator.",
      scene_title: "Opening Image",
      scene_summary: "Establish the archive before the theft is discovered.",
      user_instructions: "Open during a storm.",
      target_length: "1000 words",
      story_tense: "Past",
      story_language: "British English",
      story_pov: "3rd Person (Limited)",
      pov_character: "Mara",
    })
      .map((message) => message.content)
      .join("\n");
    expect(rendered).toContain("Mara enters the Glass Archive");
    expect(rendered).toContain("First Scene planning summary");
    expect(rendered).toContain("Establish the archive");
  });

  it("excludes premise metadata only from prose Compendium context", () => {
    const rows = [
      { typeId: "project.premise", name: "Premise" },
      { typeId: "project.genres", name: "Genres" },
      { typeId: "story.character", name: "Mara" },
      { typeId: "project.instructions", name: "Legacy instructions" },
    ];
    expect(proseContextRows(rows).map((entry) => entry.name)).toEqual(["Genres", "Mara"]);
  });

  it("allows first-Scene generation only for the earliest empty Scene", () => {
    expect(firstSceneGenerationEligible("first", "first", "")).toBe(true);
    expect(firstSceneGenerationEligible("second", "first", "")).toBe(false);
    expect(firstSceneGenerationEligible("first", "first", "Existing prose")).toBe(false);
  });

  it("keeps the newest summaries within the context budget and preserves their order", () => {
    const summaries = ["oldest".repeat(2_000), "middle".repeat(1_000), "newest"];
    const result = recentSummaryContext(summaries);
    expect(result).not.toContain("oldest");
    expect(result.indexOf("middle")).toBeLessThan(result.indexOf("newest"));
  });

  it("uses the model's actual completion limit for no-limit prose", () => {
    expect(
      proseOutputTokenBudget([{ content: "A short prompt" }], 32_768, 16_384, null, "words"),
    ).toBe(16_384);
  });

  it("reduces the output allowance to fit the remaining model context", () => {
    const budget = proseOutputTokenBudget(
      [{ content: "context".repeat(2_000) }],
      8_192,
      16_384,
      null,
      "words",
    );
    expect(budget).toBeLessThan(16_384);
    expect(budget).toBeGreaterThanOrEqual(128);
  });

  it("fails clearly when the prompt leaves no safe prose capacity", () => {
    expect(() =>
      proseOutputTokenBudget([{ content: "context".repeat(2_000) }], 2_048, 16_384, null, "words"),
    ).toThrow("too little model context");
  });

  it("continues with the original prompt and only the recent prose tail", () => {
    const original = [{ role: "user" as const, content: "Original instructions" }];
    const prose = `${"old".repeat(6_000)}\n\nRecent ending.`;
    const continued = continuationMessages(original, prose);
    expect(continued[0]).toEqual(original[0]);
    expect(continued[1]?.role).toBe("assistant");
    expect(continued[1]?.content).not.toBe(prose);
    expect(continued[1]?.content.length).toBeLessThanOrEqual(16_000);
    expect(continued[1]?.content).toContain("Recent ending.");
    expect(continued[2]?.content).toContain("Do not recap, restart, or repeat");
  });

  it("removes exact repeated prose at continuation boundaries", () => {
    const ending = "The door opened and cold air entered the room.";
    expect(trimRepeatedBoundary(`Earlier prose. ${ending}`, `${ending} She stepped back.`)).toBe(
      " She stepped back.",
    );
  });
});
