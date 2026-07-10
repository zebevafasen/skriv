import type { CompendiumEntry } from "@asterism/contracts";

export type MentionMatch = {
  from: number;
  to: number;
  text: string;
  entryIds: string[];
  matchedTerm: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findMentions(text: string, entries: readonly CompendiumEntry[]): MentionMatch[] {
  const candidates: MentionMatch[] = [];

  for (const entry of entries) {
    const terms = [...new Set([entry.name, ...entry.aliases].filter(Boolean))].sort(
      (left, right) => right.length - left.length,
    );
    for (const term of terms) {
      const flags = entry.caseSensitive ? "gu" : "giu";
      const pattern = new RegExp(
        `(?<![\\p{L}\\p{N}_])${escapeRegExp(term)}(?![\\p{L}\\p{N}_])`,
        flags,
      );
      for (const match of text.matchAll(pattern)) {
        const from = match.index;
        const to = from + match[0].length;
        const existing = candidates.find(
          (candidate) =>
            candidate.from === from && candidate.to === to && candidate.matchedTerm === match[0],
        );
        if (existing) {
          existing.entryIds.push(entry.id);
        } else {
          candidates.push({
            from,
            to,
            text: match[0],
            entryIds: [entry.id],
            matchedTerm: match[0],
          });
        }
      }
    }
  }

  candidates.sort(
    (left, right) => left.from - right.from || right.to - right.from - (left.to - left.from),
  );
  const accepted: MentionMatch[] = [];
  for (const candidate of candidates) {
    const overlapping = accepted.find(
      (match) => candidate.from < match.to && candidate.to > match.from,
    );
    if (!overlapping) {
      accepted.push({ ...candidate, entryIds: [...new Set(candidate.entryIds)] });
    } else if (overlapping.from === candidate.from && overlapping.to === candidate.to) {
      overlapping.entryIds = [...new Set([...overlapping.entryIds, ...candidate.entryIds])];
    }
  }
  return accepted.sort((left, right) => left.from - right.from);
}
