import { describe, expect, it, vi } from "vitest";
import { getModelContextLength, getModelLimits } from "./routes/settings.js";

describe("provider-neutral model limits", () => {
  it("does not query the OpenRouter catalog for deterministic fake models", async () => {
    const listModels = vi.fn(async () => [
      { id: "asterism/fake-prose", name: "Fake", contextLength: 12_000, maxCompletionTokens: 3_000 },
    ]);
    const getAi = vi.fn(async (_userId: string, model?: string) => {
      expect(model).toBe("asterism/fake-prose");
      return { listModels };
    });
    const context = { getAi } as never;
    await expect(getModelContextLength(context, "user", "asterism/fake-prose")).resolves.toBe(12_000);
    await expect(getModelLimits(context, "user", "asterism/fake-prose")).resolves.toEqual({
      contextLength: 12_000,
      maxCompletionTokens: 3_000,
    });
    expect(listModels).toHaveBeenCalledTimes(2);
  });
});
