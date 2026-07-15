import { AppError } from "@skriv/application";
import type { PromptMessage } from "@skriv/contracts";
import { Channel, invoke } from "@tauri-apps/api/core";

export type NativeAiEvent = { type: "delta"; delta: string };

export type NativeAiCompletion = {
  inputTokens: number | null;
  outputTokens: number | null;
};

type NativeErrorPayload = { code?: string; message?: string };

function nativeError(error: unknown): AppError {
  const payload = error as NativeErrorPayload;
  return new AppError(
    payload.message ?? (error instanceof Error ? error.message : String(error)),
    payload.code === "CREDENTIAL_ERROR"
      ? "CREDENTIAL_ERROR"
      : payload.code === "PROVIDER_ERROR"
        ? "PROVIDER_ERROR"
        : "INTERNAL_ERROR",
    undefined,
    payload.code === "PROVIDER_ERROR",
  );
}

export async function streamNativeAi(
  input: {
    operationId: string;
    model: string;
    messages: PromptMessage[];
    maxTokens?: number;
    temperature?: number;
  },
  onEvent: (event: NativeAiEvent) => void,
  signal?: AbortSignal,
): Promise<NativeAiCompletion> {
  if (signal?.aborted) throw new DOMException("AI operation cancelled", "AbortError");
  const channel = new Channel<NativeAiEvent>();
  channel.onmessage = onEvent;
  const cancel = () => {
    void invoke("cancel_ai_operation", { operationId: input.operationId });
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    return await invoke<NativeAiCompletion>("openrouter_stream", {
      request: input,
      onEvent: channel,
    });
  } catch (error) {
    if (signal?.aborted || (error as NativeErrorPayload)?.code === "CANCELLED") {
      throw new DOMException("AI operation cancelled", "AbortError");
    }
    throw nativeError(error);
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

export async function cancelNativeAi(operationId: string): Promise<void> {
  await invoke("cancel_ai_operation", { operationId }).catch(() => undefined);
}

export async function completeNativeAi(
  input: {
    model: string;
    messages: PromptMessage[];
    maxTokens?: number;
    temperature?: number;
  },
  signal?: AbortSignal,
): Promise<{ text: string; inputTokens: number | null; outputTokens: number | null }> {
  let text = "";
  const completion = await streamNativeAi(
    { ...input, operationId: crypto.randomUUID() },
    (event) => {
      text += event.delta;
    },
    signal,
  );
  return { text, ...completion };
}
