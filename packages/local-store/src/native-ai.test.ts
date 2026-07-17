import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import { getNativeModelLimits } from "./native-ai.js";

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {},
  invoke: vi.fn(),
}));

describe("native model limits", () => {
  it("uses the selected provider model limits and caches the model catalog", async () => {
    vi.mocked(invoke).mockResolvedValue([
      {
        id: "test/model",
        name: "Test",
        contextLength: 80_000,
        maxCompletionTokens: 12_000,
      },
    ]);

    await expect(getNativeModelLimits("test/model")).resolves.toEqual({
      contextLength: 80_000,
      maxCompletionTokens: 12_000,
    });
    await expect(getNativeModelLimits("test/model")).resolves.toEqual({
      contextLength: 80_000,
      maxCompletionTokens: 12_000,
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("list_models");
  });
});
