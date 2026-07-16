import {
  compendiumExtractionResultSchema,
  type CompendiumContent,
  type CompendiumEntry,
  type ExtractCompendiumFromTextResponse,
  type ImportExtractedCompendiumFromTextInput,
} from "@skriv/contracts";
import { approximateTokens, normalizeCompendiumContent } from "./context.js";
import { findMentions } from "./mentions.js";

type EntryIdentity = Pick<CompendiumEntry, "id" | "name" | "aliases" | "revision">;
type ExtractionEntry = Pick<
  CompendiumEntry,
  | "id"
  | "name"
  | "aliases"
  | "revision"
  | "typeId"
  | "content"
  | "trackingEnabled"
  | "matchExclusions"
  | "caseSensitive"
>;
type ExtractionDraft = ReturnType<typeof parseCompendiumExtraction>["entries"][number];
type ExtractionSuggestion = ExtractCompendiumFromTextResponse["suggestions"][number];
type ImportEntry = ImportExtractedCompendiumFromTextInput["entries"][number];

export type CompendiumImportConflict = {
  name: string;
  existingEntryId: string | null;
  reason:
    | "duplicate_name"
    | "duplicate_target"
    | "missing_target"
    | "revision_changed"
    | "target_mismatch";
};

export function normalizeCompendiumEntryName(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase();
}

export function indexCompendiumEntryNames<T extends EntryIdentity>(
  entries: readonly T[],
): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const entry of entries) {
    for (const candidate of new Set([entry.name, ...entry.aliases])) {
      const normalized = normalizeCompendiumEntryName(candidate);
      const matches = result.get(normalized) ?? [];
      if (!matches.some((match) => match.id === entry.id)) matches.push(entry);
      result.set(normalized, matches);
    }
  }
  return result;
}

export function matchingCompendiumEntries<T extends EntryIdentity>(
  name: string,
  entries: readonly T[],
): T[] {
  return indexCompendiumEntryNames(entries).get(normalizeCompendiumEntryName(name)) ?? [];
}

export function parseCompendiumExtraction(value: string) {
  const withoutReasoning = value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = withoutReasoning.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const firstBrace = withoutReasoning.indexOf("{");
  const lastBrace = withoutReasoning.lastIndexOf("}");
  const embedded =
    firstBrace >= 0 && lastBrace > firstBrace
      ? withoutReasoning.slice(firstBrace, lastBrace + 1)
      : null;
  const candidates = [withoutReasoning, fenced, embedded].filter(
    (candidate, index, all): candidate is string =>
      Boolean(candidate) && all.indexOf(candidate) === index,
  );
  let lastError: unknown = new Error("No JSON object was found in the model response.");
  for (const candidate of candidates) {
    try {
      return compendiumExtractionResultSchema.parse(JSON.parse(candidate));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function prepareCompendiumExtractionSuggestions(
  drafts: readonly ExtractionDraft[],
  entries: readonly ExtractionEntry[],
  createId: () => string = () => crypto.randomUUID(),
): ExtractionSuggestion[] {
  const nameIndex = indexCompendiumEntryNames(entries);
  const seen = new Set<string>();
  return drafts.flatMap((draft) => {
    const normalized = normalizeCompendiumEntryName(draft.name);
    if (seen.has(normalized)) return [];
    seen.add(normalized);
    return [
      {
        ...draft,
        id: createId(),
        duplicateCandidates: (nameIndex.get(normalized) ?? [])
          .map(({ id, name, typeId, revision }) => ({ id, name, typeId, revision }))
          .sort(
            (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
          ),
      },
    ];
  });
}

export function validateCompendiumImport(
  input: readonly ImportEntry[],
  entries: readonly EntryIdentity[],
): CompendiumImportConflict[] {
  const occupied = indexCompendiumEntryNames(entries);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const incoming = new Set<string>();
  const appendTargets = new Set<string>();
  const conflicts: CompendiumImportConflict[] = [];

  for (const entry of input) {
    const normalized = normalizeCompendiumEntryName(entry.name);
    const matches = occupied.get(normalized) ?? [];
    const repeated = incoming.has(normalized);
    incoming.add(normalized);
    if (entry.existingEntryId && entry.expectedExistingRevision) {
      const target = byId.get(entry.existingEntryId);
      const repeatedTarget = appendTargets.has(entry.existingEntryId);
      appendTargets.add(entry.existingEntryId);
      const reason = !target
        ? "missing_target"
        : target.revision !== entry.expectedExistingRevision
          ? "revision_changed"
          : !matches.some((match) => match.id === target.id)
            ? "target_mismatch"
            : repeated || repeatedTarget
              ? "duplicate_target"
              : null;
      if (reason)
        conflicts.push({ name: entry.name, existingEntryId: entry.existingEntryId, reason });
    } else if (matches.length > 0 || repeated) {
      conflicts.push({
        name: entry.name,
        existingEntryId: matches.length === 1 ? (matches[0]?.id ?? null) : null,
        reason: "duplicate_name",
      });
    }
  }
  return conflicts;
}

export function richTextCompendiumContent(
  text: string,
): Extract<CompendiumContent, { kind: "rich_text" }> {
  return {
    kind: "rich_text",
    plainText: text,
    document: {
      type: "doc",
      content: text.split(/\r?\n/).map((line) => ({
        type: "paragraph",
        ...(line ? { content: [{ type: "text", text: line }] } : {}),
      })),
    },
  };
}

export function appendCompendiumContent(
  content: CompendiumContent,
  appendedText: string,
): CompendiumContent {
  const text = appendedText.trim();
  if (content.kind === "text") {
    return { kind: "text", text: [content.text.trimEnd(), text].filter(Boolean).join("\n\n") };
  }
  const existingText = normalizeCompendiumContent(content).trimEnd();
  const appended = richTextCompendiumContent(text);
  if (content.kind === "selection") {
    return richTextCompendiumContent([existingText, text].filter(Boolean).join("\n\n"));
  }
  return {
    kind: "rich_text",
    plainText: [existingText, text].filter(Boolean).join("\n\n"),
    document: {
      ...content.document,
      type: content.document.type ?? "doc",
      content: [
        ...(existingText ? (content.document.content ?? []) : []),
        ...(appended.document.content ?? []),
      ],
    },
  };
}

export function formatCompendiumExtractionContext(
  entries: readonly ExtractionEntry[],
  storyText: string,
  tokenBudget = 8_000,
): string {
  if (entries.length === 0) return "No existing entries.";
  const mentionedIds = new Set(
    findMentions(storyText, entries as readonly CompendiumEntry[], {
      includeUntracked: true,
    }).flatMap((match) => match.entryIds),
  );
  const ordered = [...entries].sort(
    (left, right) =>
      Number(mentionedIds.has(right.id)) - Number(mentionedIds.has(left.id)) ||
      left.name.localeCompare(right.name),
  );
  const lines: string[] = [];
  let used = 0;
  for (const entry of ordered) {
    const aliases = entry.aliases.length ? ` (aliases: ${entry.aliases.join(", ")})` : "";
    const description = normalizeCompendiumContent(entry.content).trim();
    const descriptionLimit = mentionedIds.has(entry.id) ? 2_000 : 400;
    const prefix = `- ${entry.name}${aliases} [${entry.typeId.replace("story.", "")}]`;
    const prefixCost = approximateTokens(prefix);
    if (used + prefixCost > tokenBudget) {
      lines.push("- [Additional existing entries omitted to fit the model context.]");
      break;
    }
    const descriptionCharacterBudget = Math.max(
      0,
      Math.min(descriptionLimit, (tokenBudget - used - prefixCost - 1) * 4),
    );
    const clippedDescription = description.slice(0, descriptionCharacterBudget).trimEnd();
    const clipped =
      clippedDescription.length < description.length
        ? `${clippedDescription}…`
        : clippedDescription;
    const line = clippedDescription ? `${prefix}: ${clipped}` : prefix;
    const cost = approximateTokens(line);
    if (used + cost > tokenBudget) {
      lines.push("- [Additional existing entries omitted to fit the model context.]");
      break;
    }
    lines.push(line);
    used += cost;
  }
  return lines.join("\n");
}
