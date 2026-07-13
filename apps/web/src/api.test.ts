import type { GenerationRequest, GenerationStreamEvent } from "@asterism/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { streamGeneration } from "./api.js";

afterEach(() => vi.unstubAllGlobals());

describe("generation streaming", () => {
  it("rejects a connection that closes without a terminal generation event", async () => {
    const generationId = crypto.randomUUID();
    const response = new Response(
      `${JSON.stringify({
        type: "generation.started",
        generationId,
        sequence: 0,
        model: "test/model",
        promptId: "prose.continue",
      })}\n${JSON.stringify({
        type: "generation.delta",
        generationId,
        sequence: 1,
        delta: "Partial prose.",
      })}\n`,
      { status: 200 },
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const events: GenerationStreamEvent[] = [];

    await expect(
      streamGeneration({} as GenerationRequest, (event) => events.push(event)),
    ).rejects.toThrow("closed before completion");
    expect(events.at(-1)?.type).toBe("generation.delta");
  });
});
