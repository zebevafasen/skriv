import type {
  CompendiumEntry,
  ExtractCompendiumFromTextResponse,
  ImportExtractedCompendiumFromTextInput,
} from "@skriv/contracts";
import { matchingCompendiumEntries } from "@skriv/core";

type ExtractionSuggestion = ExtractCompendiumFromTextResponse["suggestions"][number];

export type ExtractionReviewDraft = ExtractionSuggestion & {
  selected: boolean;
  existingEntryId: string | null;
  expectedExistingRevision: number | null;
};

function selectedTarget(
  candidates: ExtractionSuggestion["duplicateCandidates"],
  preferredId?: string | null,
) {
  const preferred = candidates.find((candidate) => candidate.id === preferredId);
  if (preferred) return preferred;
  return candidates.length === 1 ? candidates[0] : null;
}

export function prepareExtractionReview(
  suggestions: readonly ExtractionSuggestion[],
): ExtractionReviewDraft[] {
  return suggestions.map((suggestion) => {
    const target = selectedTarget(suggestion.duplicateCandidates);
    return {
      ...suggestion,
      selected: true,
      existingEntryId: target?.id ?? null,
      expectedExistingRevision: target?.revision ?? null,
    };
  });
}

export function renameExtractionDraft(
  draft: ExtractionReviewDraft,
  name: string,
  entries: readonly CompendiumEntry[],
): ExtractionReviewDraft {
  const duplicateCandidates = matchingCompendiumEntries(
    name,
    entries.filter((entry) => !entry.singleton),
  ).map(({ id, name: entryName, typeId, revision }) => ({
    id,
    name: entryName,
    typeId,
    revision,
  }));
  const target = selectedTarget(duplicateCandidates, draft.existingEntryId);
  return {
    ...draft,
    name,
    duplicateCandidates,
    existingEntryId: target?.id ?? null,
    expectedExistingRevision: target?.revision ?? null,
  };
}

export function extractionReviewIsValid(drafts: readonly ExtractionReviewDraft[]): boolean {
  const selected = drafts.filter((draft) => draft.selected);
  return (
    selected.length > 0 &&
    selected.every(
      (draft) =>
        draft.name.trim().length > 0 &&
        draft.description.trim().length > 0 &&
        (draft.duplicateCandidates.length === 0 || Boolean(draft.existingEntryId)),
    )
  );
}

export function extractionReviewImportEntries(
  drafts: readonly ExtractionReviewDraft[],
): ImportExtractedCompendiumFromTextInput["entries"] {
  return drafts
    .filter((draft) => draft.selected)
    .map(({ name, typeId, description, existingEntryId, expectedExistingRevision }) => ({
      name,
      typeId,
      description,
      existingEntryId,
      expectedExistingRevision,
    }));
}

export function CompendiumExtractionReview({
  drafts,
  entries,
  onChange,
}: {
  drafts: ExtractionReviewDraft[];
  entries: CompendiumEntry[];
  onChange: (drafts: ExtractionReviewDraft[]) => void;
}) {
  const update = (id: string, change: (draft: ExtractionReviewDraft) => ExtractionReviewDraft) => {
    onChange(drafts.map((draft) => (draft.id === id ? change(draft) : draft)));
  };

  return (
    <div className="ideation-extraction-list">
      {drafts.map((draft) => {
        const target = draft.duplicateCandidates.find(
          (candidate) => candidate.id === draft.existingEntryId,
        );
        return (
          <article
            className={`ideation-extraction-card ${draft.duplicateCandidates.length ? "duplicate" : ""}`}
            key={draft.id}
          >
            <div className="ideation-extraction-card-left">
              <label className="ideation-extraction-select">
                <input
                  type="checkbox"
                  checked={draft.selected}
                  onChange={(event) =>
                    update(draft.id, (current) => ({
                      ...current,
                      selected: event.target.checked,
                    }))
                  }
                />
                Include
              </label>
              <div className="ideation-extraction-fields">
                <label>
                  Name
                  <input
                    value={draft.name}
                    aria-invalid={draft.selected && !draft.name.trim()}
                    onChange={(event) =>
                      update(draft.id, (current) =>
                        renameExtractionDraft(current, event.target.value, entries),
                      )
                    }
                  />
                </label>
                <label>
                  Category
                  <select
                    value={draft.typeId}
                    disabled={Boolean(target)}
                    title={target ? `The existing ${target.name} entry keeps its current category.` : undefined}
                    onChange={(event) =>
                      update(draft.id, (current) => ({
                        ...current,
                        typeId: event.target.value as ExtractionReviewDraft["typeId"],
                      }))
                    }
                  >
                    <option value="story.character">Character</option>
                    <option value="story.location">Location</option>
                    <option value="story.object">Object / Item</option>
                    <option value="story.faction">Faction</option>
                    <option value="story.lore">Lore</option>
                    <option value="story.other">Other</option>
                  </select>
                </label>
              </div>
              {draft.duplicateCandidates.length ? (
                <label className="ideation-extraction-target">
                  Existing entry
                  <select
                    value={draft.existingEntryId ?? ""}
                    aria-invalid={draft.selected && !draft.existingEntryId}
                    onChange={(event) => {
                      const selected = draft.duplicateCandidates.find(
                        (candidate) => candidate.id === event.target.value,
                      );
                      update(draft.id, (current) => ({
                        ...current,
                        existingEntryId: selected?.id ?? null,
                        expectedExistingRevision: selected?.revision ?? null,
                      }));
                    }}
                  >
                    {draft.duplicateCandidates.length > 1 ? (
                      <option value="">Choose the entry to update…</option>
                    ) : null}
                    {draft.duplicateCandidates.map((candidate) => (
                      <option value={candidate.id} key={candidate.id}>
                        Append to {candidate.name}
                      </option>
                    ))}
                  </select>
                  {draft.duplicateCandidates.length > 1 && !draft.existingEntryId ? (
                    <small>More than one entry uses this name or alias. Choose the intended entry.</small>
                  ) : null}
                </label>
              ) : null}
              <label className="content-field">
                Description
                <textarea
                  value={draft.description}
                  rows={5}
                  aria-invalid={draft.selected && !draft.description.trim()}
                  onChange={(event) =>
                    update(draft.id, (current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className="ideation-extraction-card-right">
              <span className="ideation-extraction-source-label">Source context</span>
              <blockquote>“{draft.evidence}”</blockquote>
              {target ? (
                <small>
                  New information will be appended to {target.name}. Its name and category will not be changed.
                </small>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
