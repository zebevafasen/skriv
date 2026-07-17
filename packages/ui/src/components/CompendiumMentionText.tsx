import type { CompendiumEntry } from "@skriv/contracts";
import type { ReactNode } from "react";
import { compendiumMentionSegments } from "../utils/mentions.js";

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
  const segments = compendiumMentionSegments(text, entries, { includeUntracked });
  if (!segments.some((segment) => segment.kind === "mention")) return text;

  const content: ReactNode[] = [];
  for (const segment of segments) {
    if (segment.kind === "text") {
      content.push(segment.text);
      continue;
    }
    const names = entries
      .filter((entry) => segment.entryIds.includes(entry.id))
      .map((entry) => entry.name);
    content.push(
      <button
        type="button"
        spellCheck={false}
        className="compendium-mention continuous-compendium-mention"
        data-entry-ids={segment.entryIds.join(",")}
        key={`${segment.from}-${segment.to}-${segment.entryIds.join("-")}`}
        title={
          segment.entryIds.length > 1
            ? `Choose a Compendium entry for “${segment.text}”`
            : `Open ${names[0] ?? segment.text} in the Compendium`
        }
        onClick={(event) => onOpenEntry(segment.entryIds, event.ctrlKey || event.metaKey)}
      >
        {segment.text}
      </button>,
    );
  }
  return content;
}
