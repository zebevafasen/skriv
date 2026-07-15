import type { PromptMessage } from "@skriv/contracts";
import { z } from "zod";

export type ModelDescriptor = {
  id: string;
  name: string;
  contextLength: number;
  maxCompletionTokens: number;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
};

export type CompletionStreamChunk = {
  text: string;
  finishReason: string | null;
};

export type CompletionRequest = {
  model: string;
  messages: PromptMessage[];
  maxOutputTokens: number;
  signal?: AbortSignal;
};

export type CompletionUsage = { inputTokens: number | null; outputTokens: number | null };

type StreamTimeouts = {
  firstByteMs?: number;
  idleMs?: number;
};

const DEFAULT_FIRST_BYTE_TIMEOUT_MS = 120_000;
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 45_000;

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout();
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface AIProvider {
  readonly name: string;
  listModels(signal?: AbortSignal): Promise<ModelDescriptor[]>;
  stream(request: CompletionRequest): AsyncIterable<CompletionStreamChunk>;
  complete(request: CompletionRequest): Promise<{ text: string; usage: CompletionUsage }>;
}

const fakeModels: ModelDescriptor[] = [
  {
    id: "skriv/fake-prose",
    name: "Skriv Fake Prose",
    contextLength: 32_768,
    maxCompletionTokens: 16_384,
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
  },
  {
    id: "skriv/fake-context",
    name: "Skriv Fake Context",
    contextLength: 32_768,
    maxCompletionTokens: 4_096,
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
  },
];

export class FakeAIProvider implements AIProvider {
  readonly name = "fake";

  constructor(private readonly delayMs = 20) {}

  async listModels(): Promise<ModelDescriptor[]> {
    return fakeModels;
  }

  async *stream(request: CompletionRequest): AsyncIterable<CompletionStreamChunk> {
    const userText =
      [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "";
    const baseOutput = userText.includes("Target event:")
      ? "The silence tightened around them. A small inconsistency in the room drew the eye, then another, each detail leading naturally toward the change that waited just out of sight."
      : "The room seemed to gather itself around the moment. What came next felt inevitable only after it happened, a quiet turn that changed the shape of everything before it.";
    const paragraphCount = Math.min(
      12,
      Number(userText.match(/approximately (\d+) paragraphs/i)?.[1] ?? 1),
    );
    const output = Array.from({ length: paragraphCount }, (_, index) =>
      index === 0
        ? baseOutput
        : `The next movement carried the moment forward with a distinct beat of its own. Detail ${index + 1} settled into the scene without breaking its voice or continuity.`,
    ).join("\n\n");
    const chunks = output.match(/[\s\S]{1,18}/g) ?? [output];
    for (const [index, chunk] of chunks.entries()) {
      if (request.signal?.aborted) throw new DOMException("Generation cancelled", "AbortError");
      if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      yield { text: chunk, finishReason: index === chunks.length - 1 ? "stop" : null };
    }
  }

  async complete(request: CompletionRequest): Promise<{ text: string; usage: CompletionUsage }> {
    const isCompendiumExtraction = request.messages.some((message) =>
      message.content.includes(
        "Extract useful Compendium entries from the supplied fiction premise.",
      ),
    );
    if (isCompendiumExtraction) {
      return {
        text: JSON.stringify({
          entries: [
            {
              name: "Mara Vale",
              typeId: "story.character",
              description: "A determined investigator drawn into the premise's central conflict.",
              evidence: "Mara Vale",
            },
            {
              name: "The Glass Archive",
              typeId: "story.location",
              description: "The archive at the center of the premise's opening mystery.",
              evidence: "the Glass Archive",
            },
          ],
        }),
        usage: { inputTokens: 1, outputTokens: 64 },
      };
    }
    const isContext = request.messages.some((message) =>
      message.content.includes("Candidate fragments:"),
    );
    if (isContext) {
      const ids = request.messages
        .flatMap((message) => [...message.content.matchAll(/\[fragment:([^\]]+)\]/g)])
        .slice(0, 8)
        .map((match) => match[1]);
      return {
        text: JSON.stringify({ selectedFragmentIds: ids }),
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    }
    const isSummary = request.messages.some((message) => message.content.includes("Scene prose:"));
    if (isSummary) {
      return {
        text: "The scene establishes a decisive change in the characters’ immediate situation, carrying the central action forward while preserving the consequences that the next scene must address.",
        usage: { inputTokens: 1, outputTokens: 32 },
      };
    }
    let text = "";
    for await (const chunk of this.stream(request)) text += chunk.text;
    return { text, usage: { inputTokens: 1, outputTokens: Math.ceil(text.length / 4) } };
  }
}

const openRouterModelsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      context_length: z.number().optional(),
      top_provider: z
        .object({
          context_length: z.number().nullable().optional(),
          max_completion_tokens: z.number().nullable().optional(),
        })
        .nullish(),
      pricing: z
        .object({ prompt: z.string().optional(), completion: z.string().optional() })
        .optional(),
    }),
  ),
});

const openRouterCompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })),
  usage: z
    .object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() })
    .optional(),
});

export class OpenRouterProvider implements AIProvider {
  readonly name = "openrouter";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://openrouter.ai/api/v1",
    private readonly appUrl = "http://localhost:5173",
    private readonly streamTimeouts: StreamTimeouts = {},
  ) {}

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": this.appUrl,
      "X-Title": "Skriv",
    };
  }

  async listModels(signal?: AbortSignal): Promise<ModelDescriptor[]> {
    const response = await fetch(`${this.baseUrl}/models`, {
      headers: this.headers(),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) throw new Error(`OpenRouter model request failed (${response.status}).`);
    const parsed = openRouterModelsSchema.parse(await response.json());
    return parsed.data.map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      contextLength: model.top_provider?.context_length ?? model.context_length ?? 32_768,
      maxCompletionTokens:
        model.top_provider?.max_completion_tokens ??
        Math.min(16_384, model.context_length ?? 32_768),
      inputPricePerMillion: model.pricing?.prompt ? Number(model.pricing.prompt) * 1_000_000 : null,
      outputPricePerMillion: model.pricing?.completion
        ? Number(model.pricing.completion) * 1_000_000
        : null,
    }));
  }

  async *stream(request: CompletionRequest): AsyncIterable<CompletionStreamChunk> {
    const firstByteMs = this.streamTimeouts.firstByteMs ?? DEFAULT_FIRST_BYTE_TIMEOUT_MS;
    const idleMs = this.streamTimeouts.idleMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(request.signal?.reason);
    if (request.signal?.aborted) forwardAbort();
    else request.signal?.addEventListener("abort", forwardAbort, { once: true });

    let fetchTimedOut = false;
    let response: Response;
    try {
      response = await withTimeout(
        fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            max_tokens: request.maxOutputTokens,
            stream: true,
          }),
          signal: controller.signal,
        }),
        firstByteMs,
        () => {
          fetchTimedOut = true;
          controller.abort();
        },
        "The AI provider did not start the response in time.",
      );
    } catch (error) {
      request.signal?.removeEventListener("abort", forwardAbort);
      if (fetchTimedOut) throw new Error("The AI provider did not start the response in time.");
      throw error;
    }
    if (!response.ok || !response.body) {
      request.signal?.removeEventListener("abort", forwardAbort);
      throw new Error(
        `OpenRouter generation failed (${response.status}): ${await response.text()}`,
      );
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let receivedBytes = false;
    let finishReason: string | null = null;
    try {
      while (true) {
        const timeoutMs = receivedBytes ? idleMs : firstByteMs;
        const { done, value } = await withTimeout(
          reader.read(),
          timeoutMs,
          () => controller.abort(),
          receivedBytes
            ? "The AI provider stopped sending data. Your partial draft was preserved."
            : "The AI provider did not send any data in time.",
        );
        if (value) {
          receivedBytes = true;
          buffer += value;
        }
        const lines = buffer.split("\n");
        buffer = done ? "" : (lines.pop() ?? "");
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          if (data === "[DONE]") {
            yield { text: "", finishReason: finishReason ?? "stop" };
            return;
          }
          const parsed = JSON.parse(data) as {
            error?: { message?: string };
            choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
          };
          if (parsed.error) {
            throw new Error(parsed.error.message ?? "The AI provider reported a streaming error.");
          }
          const choice = parsed.choices?.[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          const delta = choice?.delta?.content;
          if (delta) yield { text: delta, finishReason: null };
        }
        if (done) {
          throw new Error(
            "The AI provider stream ended unexpectedly. Your partial draft was preserved.",
          );
        }
      }
    } finally {
      request.signal?.removeEventListener("abort", forwardAbort);
      await reader.cancel().catch(() => undefined);
    }
  }

  async complete(request: CompletionRequest): Promise<{ text: string; usage: CompletionUsage }> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        max_tokens: request.maxOutputTokens,
        stream: false,
      }),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    if (!response.ok)
      throw new Error(
        `OpenRouter completion failed (${response.status}): ${await response.text()}`,
      );
    const parsed = openRouterCompletionSchema.parse(await response.json());
    return {
      text: parsed.choices[0]?.message.content ?? "",
      usage: {
        inputTokens: parsed.usage?.prompt_tokens ?? null,
        outputTokens: parsed.usage?.completion_tokens ?? null,
      },
    };
  }
}

export function createAIProvider(config: {
  provider: "fake" | "openrouter";
  fakeDelayMs?: number;
  apiKey?: string;
  baseUrl?: string;
  appUrl?: string;
}): AIProvider {
  if (config.provider === "openrouter") {
    if (!config.apiKey) throw new Error("OpenRouter API key is required.");
    return new OpenRouterProvider(config.apiKey, config.baseUrl, config.appUrl);
  }
  return new FakeAIProvider(config.fakeDelayMs);
}
