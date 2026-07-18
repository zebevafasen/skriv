import type { CompendiumEntry } from "@skriv/contracts";
import { findMentions, type MentionMatch } from "@skriv/core";

export type CompendiumMentionSegment =
  | { kind: "text"; from: number; to: number; text: string }
  | { kind: "mention"; from: number; to: number; text: string; entryIds: string[] };

export function compendiumMentionMatches(
  text: string,
  entries: readonly CompendiumEntry[],
  options: { includeUntracked?: boolean } = {},
): MentionMatch[] {
  return findMentions(text, entries, options);
}

export function compendiumMentionSegments(
  text: string,
  entries: readonly CompendiumEntry[],
  options: { includeUntracked?: boolean } = {},
): CompendiumMentionSegment[] {
  const matches = compendiumMentionMatches(text, entries, options);
  const segments: CompendiumMentionSegment[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.from > cursor) {
      segments.push({
        kind: "text",
        from: cursor,
        to: match.from,
        text: text.slice(cursor, match.from),
      });
    }
    segments.push({
      kind: "mention",
      from: match.from,
      to: match.to,
      text: match.text,
      entryIds: match.entryIds,
    });
    cursor = match.to;
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", from: cursor, to: text.length, text: text.slice(cursor) });
  }
  return segments;
}
