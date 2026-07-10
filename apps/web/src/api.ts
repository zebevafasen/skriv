import type { GenerationRequest, GenerationStreamEvent } from "@asterism/contracts";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string; details?: unknown };
    } | null;
    if (response.status === 401 && !path.startsWith("/api/auth/")) {
      window.location.assign("/login");
    }
    throw new ApiError(
      payload?.error?.message ?? `Request failed (${response.status}).`,
      response.status,
      payload?.error?.details,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function streamGeneration(
  input: GenerationRequest,
  onEvent: (event: GenerationStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/generations", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify(input),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new ApiError(payload?.error?.message ?? "Generation could not start.", response.status);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as GenerationStreamEvent);
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as GenerationStreamEvent);
}
