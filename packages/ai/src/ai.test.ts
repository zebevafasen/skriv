import { describe, expect, it } from "vitest";
import { FakeAIProvider } from "./index.js";

describe("FakeAIProvider", () => {
  it("streams deterministic prose", async () => {
    const provider = new FakeAIProvider(0);
    let result = "";
    for await (const chunk of provider.stream({
      model: "asterism/fake-prose",
      messages: [{ role: "user", content: "Continue" }],
      maxOutputTokens: 100,
    })) {
      result += chunk;
    }
    expect(result).toContain("room");
  });

  it("returns supplied fragment identifiers for context extraction", async () => {
    const provider = new FakeAIProvider(0);
    const result = await provider.complete({
      model: "asterism/fake-context",
      messages: [{ role: "user", content: "Candidate fragments:\n[fragment:abc] fact" }],
      maxOutputTokens: 100,
    });
    expect(JSON.parse(result.text).selectedFragmentIds).toEqual(["abc"]);
  });

  it("preserves requested paragraph boundaries while streaming", async () => {
    const provider = new FakeAIProvider(0);
    let result = "";
    for await (const chunk of provider.stream({
      model: "asterism/fake-prose",
      messages: [{ role: "user", content: "Write approximately 3 paragraphs." }],
      maxOutputTokens: 1_000,
    })) {
      result += chunk;
    }
    expect(result.split("\n\n")).toHaveLength(3);
  });

  it("returns a deterministic Scene summary", async () => {
    const provider = new FakeAIProvider(0);
    const result = await provider.complete({
      model: "asterism/fake-prose",
      messages: [{ role: "user", content: "Scene prose:\nA door opened." }],
      maxOutputTokens: 700,
    });
    expect(result.text).toContain("decisive change");
  });
});
