import type { ManuscriptTree } from "@skriv/contracts";

export type ManuscriptStructureKind = "Act" | "Chapter" | "Scene";
export type ManuscriptLabel = {
  ordinal: number;
  title: string;
  label: string;
};

export function formatManuscriptLabel(
  kind: ManuscriptStructureKind,
  ordinal: number,
  title: string,
): string {
  const base = `${kind} ${ordinal}`;
  const trimmed = title.trim();
  return trimmed ? `${base}: ${trimmed}` : base;
}

export function manuscriptLabels(tree: ManuscriptTree) {
  const acts = new Map<string, ManuscriptLabel>();
  const chapters = new Map<string, ManuscriptLabel>();
  const scenes = new Map<string, ManuscriptLabel>();
  let chapterOrdinal = 0;
  let sceneOrdinal = 0;

  tree.acts.forEach((act, actIndex) => {
    const ordinal = actIndex + 1;
    acts.set(act.id, {
      ordinal,
      title: act.title,
      label: formatManuscriptLabel("Act", ordinal, act.title),
    });
    act.chapters.forEach((chapter) => {
      chapterOrdinal += 1;
      chapters.set(chapter.id, {
        ordinal: chapterOrdinal,
        title: chapter.title,
        label: formatManuscriptLabel("Chapter", chapterOrdinal, chapter.title),
      });
      chapter.scenes.forEach((scene) => {
        sceneOrdinal += 1;
        scenes.set(scene.id, {
          ordinal: sceneOrdinal,
          title: scene.title,
          label: formatManuscriptLabel("Scene", sceneOrdinal, scene.title),
        });
      });
    });
  });

  return { acts, chapters, scenes };
}
