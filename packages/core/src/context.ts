import type { CompendiumContent, CompendiumEntry, ContextFragment } from "@asterism/contracts";
import { findMentions } from "./mentions.js";

export type ContextDiscoveryInput = {
  entries: CompendiumEntry[];
  scanText: string;
  scenePresenceEntryIds?: string[];
  maxDepth?: number;
  includeSmartCandidates?: boolean;
};

export type DiscoveredEntry = {
  entry: CompendiumEntry;
  activationSource: ContextFragment["activationSource"];
  recursionDepth: number;
  priority: number;
};

export type ReferenceDiscoveryInput = {
  entries: CompendiumEntry[];
  scanText: string;
  pinnedEntryIds?: string[];
  maxDepth?: number;
};

export type DiscoveredReference = {
  entry: CompendiumEntry;
  referenceSource: "pinned" | "mentioned" | "recursive";
  recursionDepth: number;
  priority: number;
};

export function normalizeCompendiumContent(content: CompendiumContent): string {
  if (content.kind === "text") return content.text;
  if (content.kind === "selection") return content.values.map((value) => value.label).join(", ");
  return content.plainText;
}

export function normalizeEntry(entry: CompendiumEntry): string {
  return `[Entry Type: ${entry.typeId}]\n[Entry Name: ${entry.name}]\n\n${normalizeCompendiumContent(entry.content)}`;
}

export function discoverEntries({
  entries,
  scanText,
  scenePresenceEntryIds = [],
  maxDepth = 2,
  includeSmartCandidates = false,
}: ContextDiscoveryInput): DiscoveredEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const found = new Map<string, DiscoveredEntry>();

  const include = (
    entry: CompendiumEntry,
    activationSource: DiscoveredEntry["activationSource"],
    recursionDepth: number,
    priority: number,
  ) => {
    if (entry.activationMode === "never") return false;
    if (entry.activationMode === "smart" && activationSource !== "smart") return false;
    const previous = found.get(entry.id);
    if (!previous || priority > previous.priority) {
      found.set(entry.id, { entry, activationSource, recursionDepth, priority });
      return true;
    }
    return false;
  };

  for (const match of findMentions(scanText, entries)) {
    for (const entryId of match.entryIds) {
      const entry = byId.get(entryId);
      if (entry?.activationMode === "mention") include(entry, "direct", 0, 100);
    }
  }
  for (const entryId of scenePresenceEntryIds) {
    const entry = byId.get(entryId);
    if (entry?.activationMode === "smart") {
      if (includeSmartCandidates) include(entry, "smart", 0, 70);
    } else if (entry) include(entry, "scene_presence", 0, 110);
  }
  for (const entry of entries) {
    if (entry.activationMode === "always") include(entry, "always", 0, 80);
    if (entry.activationMode === "smart" && includeSmartCandidates) {
      include(entry, "smart", 0, 40);
    }
  }

  let frontier = [...found.values()];
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: DiscoveredEntry[] = [];
    for (const source of frontier) {
      for (const match of findMentions(normalizeEntry(source.entry), entries)) {
        for (const entryId of match.entryIds) {
          const entry = byId.get(entryId);
          if (
            entry &&
            entry.id !== source.entry.id &&
            include(
              entry,
              entry.activationMode === "smart" ? "smart" : "recursive",
              depth,
              entry.activationMode === "smart" ? 50 - depth * 5 : 60 - depth * 10,
            )
          ) {
            next.push(found.get(entry.id) as DiscoveredEntry);
          }
        }
      }
    }
    frontier = next;
  }

  return [...found.values()].sort(
    (left, right) => right.priority - left.priority || left.recursionDepth - right.recursionDepth,
  );
}

/**
 * Resolves deliberate references for request-scoped context. Direct text matches
 * ignore trackingEnabled, while recursive discovery retains the entry's normal
 * matching rules. Pinned entries are an explicit override of activationMode.
 */
export function discoverReferences({
  entries,
  scanText,
  pinnedEntryIds = [],
  maxDepth = 2,
}: ReferenceDiscoveryInput): DiscoveredReference[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const found = new Map<string, DiscoveredReference>();

  const include = (
    entry: CompendiumEntry,
    referenceSource: DiscoveredReference["referenceSource"],
    recursionDepth: number,
    priority: number,
  ) => {
    const previous = found.get(entry.id);
    if (!previous || priority > previous.priority) {
      found.set(entry.id, { entry, referenceSource, recursionDepth, priority });
      return !previous;
    }
    return false;
  };

  for (const entryId of new Set(pinnedEntryIds)) {
    const entry = byId.get(entryId);
    if (entry) include(entry, "pinned", 0, 120);
  }
  for (const match of findMentions(scanText, entries, { includeUntracked: true })) {
    for (const entryId of match.entryIds) {
      const entry = byId.get(entryId);
      if (entry && entry.activationMode !== "never") include(entry, "mentioned", 0, 110);
    }
  }

  let frontier = [...found.values()];
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: DiscoveredReference[] = [];
    for (const source of frontier) {
      for (const match of findMentions(normalizeEntry(source.entry), entries)) {
        for (const entryId of match.entryIds) {
          const entry = byId.get(entryId);
          if (
            entry &&
            entry.id !== source.entry.id &&
            entry.activationMode !== "never" &&
            include(entry, "recursive", depth, 80 - depth * 10)
          ) {
            next.push(found.get(entry.id) as DiscoveredReference);
          }
        }
      }
    }
    frontier = next;
  }

  return [...found.values()].sort(
    (left, right) => right.priority - left.priority || left.recursionDepth - right.recursionDepth,
  );
}

function stableHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function segmentEntry(discovered: DiscoveredEntry): ContextFragment[] {
  const source = normalizeCompendiumContent(discovered.entry.content);
  const segments =
    discovered.entry.content.kind === "selection"
      ? discovered.entry.content.values.map((value) => value.label)
      : source.split(/\n\s*\n|(?=^#{1,6}\s)/gm);

  return segments
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: `${discovered.entry.id}:${index}:${stableHash(text)}`,
      entryId: discovered.entry.id,
      entryName: discovered.entry.name,
      text,
      activationSource: discovered.activationSource,
      recursionDepth: discovered.recursionDepth,
      priority: discovered.priority - index * 0.01,
    }));
}

export function approximateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

export function budgetFragments(
  fragments: ContextFragment[],
  tokenBudget: number,
): ContextFragment[] {
  const selected: ContextFragment[] = [];
  let used = 0;
  for (const fragment of [...fragments].sort((left, right) => right.priority - left.priority)) {
    const cost = approximateTokens(fragment.text) + 12;
    if (used + cost <= tokenBudget) {
      selected.push(fragment);
      used += cost;
    }
  }
  return selected;
}
