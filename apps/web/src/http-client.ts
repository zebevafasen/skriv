import {
  AppError,
  createSkrivClient,
  type AppErrorCode,
  type ClientRequest,
  type RequestTransport,
} from "@skriv/application";
import type {
  ChatStreamEvent,
  GenerationRequest,
  GenerationStreamEvent,
  ManuscriptExportOptions,
} from "@skriv/contracts";

type ErrorPayload = { error?: { code?: string; message?: string; details?: unknown } };

const codes = new Set<AppErrorCode>([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "NETWORK_ERROR",
  "UNSUPPORTED",
  "VALIDATION_ERROR",
  "PROVIDER_ERROR",
  "CREDENTIAL_ERROR",
  "CANCELLED",
  "DATABASE_ERROR",
  "FILE_ERROR",
  "INTERNAL_ERROR",
]);

function statusCode(status: number): AppErrorCode {
  if (status === 400 || status === 422) return "VALIDATION_ERROR";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  return "INTERNAL_ERROR";
}

async function responseError(response: Response, path: string): Promise<AppError> {
  const payload = (await response.json().catch(() => null)) as ErrorPayload | null;
  const supplied = payload?.error?.code;
  const code = supplied && codes.has(supplied as AppErrorCode)
    ? (supplied as AppErrorCode)
    : statusCode(response.status);
  if (code === "UNAUTHORIZED" && !path.startsWith("/api/auth/")) {
    window.location.assign("/login");
  }
  return new AppError(
    payload?.error?.message ?? `Request failed (${response.status}).`,
    code,
    payload?.error?.details,
    code === "RATE_LIMITED" || response.status >= 500,
  );
}

async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(path, { ...init, credentials: "include" });
    if (!response.ok) throw await responseError(response, path);
    return response;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError("The operation was cancelled.", "CANCELLED");
    }
    throw new AppError(
      error instanceof Error ? error.message : "The hosted service could not be reached.",
      "NETWORK_ERROR",
      undefined,
      true,
    );
  }
}

const transport: RequestTransport = {
  async request<T>(path: string, init?: ClientRequest): Promise<T> {
    const headers = new Headers(init?.headers);
    if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetchApi(path, { ...init, headers });
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  },
};

async function streamNdjson<T extends { type: string }>(
  path: string,
  init: RequestInit,
  onEvent: (event: T) => void,
  terminal: (event: T) => boolean,
): Promise<void> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/x-ndjson");
  if (init.body != null) headers.set("Content-Type", "application/json");
  const response = await fetchApi(path, {
    ...init,
    headers,
  });
  if (!response.body) throw new AppError("The response stream was unavailable.", "NETWORK_ERROR", undefined, true);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let terminalReceived = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as T;
      terminalReceived ||= terminal(event);
      onEvent(event);
    }
  }
  if (buffer.trim()) {
    const event = JSON.parse(buffer) as T;
    terminalReceived ||= terminal(event);
    onEvent(event);
  }
  if (!terminalReceived) {
    throw new AppError(
      "The connection closed before the operation reached a terminal state.",
      "NETWORK_ERROR",
      undefined,
      true,
    );
  }
}

function filename(response: Response, fallback: string): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match?.[1]?.replace(/[\\/:*?"<>|]/g, "-") ?? fallback;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function chooseArchive(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".skriv,.json,application/json,application/zip";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

export function createWebClient() {
  return createSkrivClient(
    transport,
    {
      generation(input: GenerationRequest, onEvent, signal) {
        return streamNdjson<GenerationStreamEvent>(
          "/api/generations",
          { method: "POST", body: JSON.stringify(input), ...(signal ? { signal } : {}) },
          onEvent,
          (event) => ["generation.completed", "generation.failed", "generation.cancelled"].includes(event.type),
        );
      },
      chat(path: string, content, onEvent, signal) {
        return streamNdjson<ChatStreamEvent>(
          path,
          {
            method: "POST",
            ...(content === null ? {} : { body: JSON.stringify({ content }) }),
            ...(signal ? { signal } : {}),
          },
          onEvent,
          (event) => ["chat.completed", "chat.failed", "chat.cancelled"].includes(event.type),
        );
      },
    },
    {
      async exportProject(projectId: string, options: ManuscriptExportOptions) {
        if (options.format === "json") {
          const transfer = await transport.request<{
            downloadUrl: string;
            filename: string;
          }>(`/api/projects/${projectId}/archive-transfers/export`, { method: "POST" });
          const anchor = document.createElement("a");
          anchor.href = transfer.downloadUrl;
          anchor.download = transfer.filename;
          anchor.rel = "noopener";
          anchor.click();
          return;
        }
        const response = await fetchApi(`/api/projects/${projectId}/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options),
        });
        download(await response.blob(), filename(response, `skriv-export.${options.format}`));
      },
      async importProject() {
        const file = await chooseArchive();
        if (!file) return null;
        if (!file.name.toLocaleLowerCase().endsWith(".json")) {
          const transfer = await transport.request<{ transferId: string; uploadUrl: string }>(
            "/api/archive-transfers/import",
            { method: "POST" },
          );
          const upload = await fetch(transfer.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/vnd.skriv.project+zip" },
            body: file,
          });
          if (!upload.ok)
            throw new AppError(`Archive upload failed (${upload.status}).`, "NETWORK_ERROR", undefined, true);
          return transport.request(`/api/archive-transfers/${transfer.transferId}/import`, {
            method: "POST",
          });
        }
        return transport.request("/api/projects/import", { method: "POST", body: await file.text() });
      },
    },
    {
      platform: "web",
      accounts: true,
      invitations: true,
      localBackups: false,
      nativeFileDialogs: false,
    },
    null,
  );
}
