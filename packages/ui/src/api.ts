import { AppError, getAsterismClient } from "@asterism/application";
import type { GenerationRequest, GenerationStreamEvent } from "@asterism/contracts";

export { AppError, AppError as ApiError };

export function asterism() {
  return getAsterismClient();
}

export function streamGeneration(
  input: GenerationRequest,
  onEvent: (event: GenerationStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return getAsterismClient().generation.start(input, onEvent, signal);
}
