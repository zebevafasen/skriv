import { AppError, getSkrivClient } from "@skriv/application";
import type { GenerationRequest, GenerationStreamEvent } from "@skriv/contracts";

export { AppError, AppError as ApiError };

export function skriv() {
  return getSkrivClient();
}

export function streamGeneration(
  input: GenerationRequest,
  onEvent: (event: GenerationStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return getSkrivClient().generation.start(input, onEvent, signal);
}
