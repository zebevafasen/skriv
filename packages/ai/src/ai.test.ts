import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeAIProvider, OpenRouterProvider } from "./index.js";

afterEach(() => vi.unstubAllGlobals());

describe("FakeAIProvider", () => {
  it("streams deterministic prose", async () => {
    const provider = new FakeAIProvider(0);
    let result = "";
    for await (const chunk of provider.stream({
      model: "asterism/fake-prose",
      messages: [{ role: "user", content: "Continue" }],
      maxOutputTokens: 100,
    })) {
      result += chunk.text;
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
      result += chunk.text;
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

describe("OpenRouterProvider streaming", () => {
  it("uses the top provider's reported context and completion limits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          data: [
            {
              id: "test/model",
              name: "Test Model",
              context_length: 100_000,
              top_provider: { context_length: 80_000, max_completion_tokens: 24_000 },
            },
          ],
        }),
      ),
    );
    const provider = new OpenRouterProvider("test-key", "https://example.test");

    await expect(provider.listModels()).resolves.toEqual([
      expect.objectContaining({
        id: "test/model",
        contextLength: 80_000,
        maxCompletionTokens: 24_000,
      }),
    ]);
  });

  it("finishes as soon as OpenRouter sends DONE even if the connection remains open", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"Finished prose."}}]}\n\ndata: [DONE]\n\n',
          ),
        );
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    const provider = new OpenRouterProvider("test-key", "https://example.test");

    let result = "";
    let finishReason: string | null = null;
    for await (const chunk of provider.stream({
      model: "test/model",
      messages: [{ role: "user", content: "Continue naturally." }],
      maxOutputTokens: 1_000,
    })) {
      result += chunk.text;
      if (chunk.finishReason) finishReason = chunk.finishReason;
    }

    expect(result).toBe("Finished prose.");
    expect(finishReason).toBe("stop");
  });

  it("rejects a provider stream that closes without a DONE marker", async () => {
    const body = new Response(
      'data: {"choices":[{"delta":{"content":"Partial prose."}}]}\n\n',
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(body));
    const provider = new OpenRouterProvider("test-key", "https://example.test");

    const consume = async () => {
      for await (const _chunk of provider.stream({
        model: "test/model",
        messages: [{ role: "user", content: "Continue naturally." }],
        maxOutputTokens: 1_000,
      })) {
        // Consume the stream so its terminal state is observed.
      }
    };

    await expect(consume()).rejects.toThrow("stream ended unexpectedly");
  });

  it("reports the output-limit finish reason with the generated prose", async () => {
    const body = new Response(
      'data: {"choices":[{"delta":{"content":"Partial prose."}}]}\n\n' +
        'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n' +
        "data: [DONE]\n\n",
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(body));
    const provider = new OpenRouterProvider("test-key", "https://example.test");

    let result = "";
    let finishReason: string | null = null;
    for await (const chunk of provider.stream({
      model: "test/model",
      messages: [{ role: "user", content: "Continue naturally." }],
      maxOutputTokens: 1_000,
    })) {
      result += chunk.text;
      if (chunk.finishReason) finishReason = chunk.finishReason;
    }
    expect(result).toBe("Partial prose.");
    expect(finishReason).toBe("length");
  });
});
