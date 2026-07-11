import type { CompendiumEntry } from "@asterism/contracts";
import { findMentions } from "@asterism/core";
import type { ReactNode } from "react";

export function CompendiumMentionText({
  text,
  entries,
  onOpenEntry,
  includeUntracked = false,
}: {
  text: string;
  entries: CompendiumEntry[];
  onOpenEntry: (entryIds: string[], direct: boolean) => void;
  includeUntracked?: boolean;
}) {
  const matches = findMentions(text, entries, { includeUntracked });
  if (matches.length === 0) return text;

  const content: ReactNode[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.from > cursor) content.push(text.slice(cursor, match.from));
    const names = entries
      .filter((entry) => match.entryIds.includes(entry.id))
      .map((entry) => entry.name);
    content.push(
      <button
        type="button"
        className="compendium-mention continuous-compendium-mention"
        data-entry-ids={match.entryIds.join(",")}
        key={`${match.from}-${match.to}-${match.entryIds.join("-")}`}
        title={
          match.entryIds.length > 1
            ? `Choose a Compendium entry for “${match.text}”`
            : `Open ${names[0] ?? match.text} in the Compendium`
        }
        onClick={(event) => onOpenEntry(match.entryIds, event.ctrlKey || event.metaKey)}
      >
        {match.text}
      </button>,
    );
    cursor = match.to;
  }
  if (cursor < text.length) content.push(text.slice(cursor));
  return content;
}
