import { approximateTokens } from "@skriv/core";

export type ChatContextProvenance = {
  reason: "explicit" | "user_mention" | "canonical" | "always" | "recursive" | "smart";
  source: string;
  depth: number;
};

export type ChatContextPiece = {
  key: string;
  text: string;
  priority: number;
  provenance: ChatContextProvenance;
};

export function chatTokenBudget(contextLength: number) {
  const safeWindow = Math.max(2_048, contextLength);
  const outputTokens = Math.min(8_000, Math.floor(safeWindow * 0.25));
  const safetyTokens = Math.max(512, Math.ceil(safeWindow * 0.05));
  return {
    contextLength: safeWindow,
    outputTokens,
    safetyTokens,
    inputTokens: Math.max(512, safeWindow - outputTokens - safetyTokens),
  };
}

export function selectChatContext(pieces: ChatContextPiece[], tokenBudget: number) {
  const selected: ChatContextPiece[] = [];
  const seen = new Set<string>();
  let usedTokens = 0;
  for (const piece of [...pieces].sort((left, right) => right.priority - left.priority)) {
    if (seen.has(piece.key)) continue;
    seen.add(piece.key);
    const cost = approximateTokens(piece.text) + 12;
    if (usedTokens + cost > tokenBudget) continue;
    selected.push(piece);
    usedTokens += cost;
  }
  return { selected, usedTokens, dropped: seen.size - selected.length };
}
