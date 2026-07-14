import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebClient } from "./http-client";

describe("hosted streaming transport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not label a bodyless regeneration request as JSON", async () => {
    const fetchMock = vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("content-type")).toBeNull();
      expect(headers.get("accept")).toBe("application/x-ndjson");
      return new Response('{"type":"chat.completed"}\n', { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await createWebClient().chat.regenerate("thread-1", () => undefined);

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
