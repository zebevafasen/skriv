import type { PromptMessage } from "@asterism/contracts";
import { z } from "zod";

export type ModelDescriptor = {
  id: string;
  name: string;
  contextLength: number;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
};

export type CompletionRequest = {
  model: string;
  messages: PromptMessage[];
  maxOutputTokens: number;
  signal?: AbortSignal;
};

export type CompletionUsage = { inputTokens: number | null; outputTokens: number | null };

export interface AIProvider {
  readonly name: string;
  listModels(signal?: AbortSignal): Promise<ModelDescriptor[]>;
  stream(request: CompletionRequest): AsyncIterable<string>;
  complete(request: CompletionRequest): Promise<{ text: string; usage: CompletionUsage }>;
}

const fakeModels: ModelDescriptor[] = [
  {
    id: "asterism/fake-prose",
    name: "Asterism Fake Prose",
    contextLength: 32_768,
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
  },
  {
    id: "asterism/fake-context",
    name: "Asterism Fake Context",
    contextLength: 32_768,
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

  async *stream(request: CompletionRequest): AsyncIterable<string> {
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
    for (const chunk of chunks) {
      if (request.signal?.aborted) throw new DOMException("Generation cancelled", "AbortError");
      if (this.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      yield chunk;
    }
  }

  async complete(request: CompletionRequest): Promise<{ text: string; usage: CompletionUsage }> {
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
    let text = "";
    for await (const chunk of this.stream(request)) text += chunk;
    return { text, usage: { inputTokens: 1, outputTokens: Math.ceil(text.length / 4) } };
  }
}

const openRouterModelsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      context_length: z.number().optional(),
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
  ) {}

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": this.appUrl,
      "X-Title": "Asterism",
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
      contextLength: model.context_length ?? 32_768,
      inputPricePerMillion: model.pricing?.prompt ? Number(model.pricing.prompt) * 1_000_000 : null,
      outputPricePerMillion: model.pricing?.completion
        ? Number(model.pricing.completion) * 1_000_000
        : null,
    }));
  }

  async *stream(request: CompletionRequest): AsyncIterable<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        max_tokens: request.maxOutputTokens,
        stream: true,
      }),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    if (!response.ok || !response.body) {
      throw new Error(
        `OpenRouter generation failed (${response.status}): ${await response.text()}`,
      );
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
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
