import { describe, expect, it } from "vitest";
import { type ChatContextPiece, chatTokenBudget, selectChatContext } from "./chat-context.js";

const piece = (key: string, priority: number, text = "short context"): ChatContextPiece => ({
  key,
  priority,
  text,
  provenance: { reason: "explicit", source: key, depth: 0 },
});

describe("chat context budgeting", () => {
  it("derives output and safety reservations from the model window", () => {
    expect(chatTokenBudget(32_768)).toEqual({
      contextLength: 32_768,
      outputTokens: 8_000,
      safetyTokens: 1_639,
      inputTokens: 23_129,
    });
    expect(chatTokenBudget(4_096).outputTokens).toBe(1_024);
  });

  it("deduplicates and retains higher-priority context first", () => {
    const result = selectChatContext(
      [piece("low", 1, "x".repeat(80)), piece("high", 100), piece("high", 2)],
      20,
    );
    expect(result.selected.map((item) => item.key)).toEqual(["high"]);
    expect(result.dropped).toBe(1);
  });
});
