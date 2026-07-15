import { describe, expect, it, vi } from "vitest";
import { getModelContextLength, getModelLimits } from "./routes/settings.js";

describe("provider-neutral model limits", () => {
  it("does not query the OpenRouter catalog for deterministic fake models", async () => {
    const listModels = vi.fn(async () => [
      { id: "skriv/fake-prose", name: "Fake", contextLength: 12_000, maxCompletionTokens: 3_000 },
    ]);
    const getAi = vi.fn(async (_userId: string, model?: string) => {
      expect(model).toBe("skriv/fake-prose");
      return { listModels };
    });
    const context = { getAi } as never;
    await expect(getModelContextLength(context, "user", "skriv/fake-prose")).resolves.toBe(12_000);
    await expect(getModelLimits(context, "user", "skriv/fake-prose")).resolves.toEqual({
      contextLength: 12_000,
      maxCompletionTokens: 3_000,
    });
    expect(listModels).toHaveBeenCalledTimes(2);
  });
});
