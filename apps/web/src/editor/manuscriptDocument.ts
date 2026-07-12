import type { ManuscriptTree, Scene } from "@asterism/contracts";
import { manuscriptLabels } from "@asterism/core";
import type { JSONContent } from "@tiptap/core";
import { generatedProseContent } from "./generatedProse.js";

export type ManuscriptScope =
  | { kind: "scene"; id: string }
  | { kind: "story" }
  | { kind: "act"; id: string }
  | { kind: "chapter"; id: string };

export function scenesForScope(tree: ManuscriptTree, scope: ManuscriptScope): Scene[] {
  if (scope.kind === "scene") {
    return tree.acts
      .flatMap((act) => act.chapters.flatMap((chapter) => chapter.scenes))
      .filter((scene) => scene.id === scope.id);
  }
  return tree.acts
    .filter((act) => scope.kind !== "act" || act.id === scope.id)
    .flatMap((act) =>
      act.chapters
        .filter((chapter) => scope.kind !== "chapter" || chapter.id === scope.id)
        .flatMap((chapter) => chapter.scenes),
    );
}

export function compositeDocument(tree: ManuscriptTree, scope: ManuscriptScope): JSONContent {
  const labels = manuscriptLabels(tree);
  const sceneBlock = (
    scene: Scene,
    actId: string,
    chapterId: string,
    isLastInChapter: boolean,
    isLastInAct: boolean,
  ): JSONContent => ({
    type: "sceneBlock",
    attrs: {
      sceneId: scene.id,
      title: scene.title,
      version: scene.version,
      position: scene.position,
      displayLabel: labels.scenes.get(scene.id)?.label ?? "Scene",
      actId,
      chapterId,
      isLastInChapter,
      isLastInAct,
    },
    content: scene.document.content?.length
      ? (scene.document.content as JSONContent[])
      : [{ type: "paragraph" }],
  });

  if (scope.kind === "scene") {
    let located:
      | {
          scene: Scene;
          actId: string;
          chapterId: string;
          isLastInChapter: boolean;
          isLastInAct: boolean;
        }
      | undefined;
    for (const act of tree.acts) {
      for (const chapter of act.chapters) {
        const index = chapter.scenes.findIndex((scene) => scene.id === scope.id);
        if (index >= 0) {
          located = {
            scene: chapter.scenes[index] as Scene,
            actId: act.id,
            chapterId: chapter.id,
            isLastInChapter: index === chapter.scenes.length - 1,
            isLastInAct:
              index === chapter.scenes.length - 1 && act.chapters.at(-1)?.id === chapter.id,
          };
          break;
        }
      }
      if (located) break;
    }
    return {
      type: "doc",
      content: located
        ? [
            sceneBlock(
              located.scene,
              located.actId,
              located.chapterId,
              located.isLastInChapter,
              located.isLastInAct,
            ),
          ]
        : [],
    };
  }

  const content: JSONContent[] = [];
  for (const act of tree.acts.filter((item) => scope.kind !== "act" || item.id === scope.id)) {
    if (scope.kind !== "chapter") {
      content.push({
        type: "manuscriptHeading",
        attrs: {
          id: act.id,
          level: "act",
          title: act.title,
          position: act.position,
          ordinal: labels.acts.get(act.id)?.ordinal ?? 1,
        },
      });
    }
    for (const chapter of act.chapters.filter(
      (item) => scope.kind !== "chapter" || item.id === scope.id,
    )) {
      content.push({
        type: "manuscriptHeading",
        attrs: {
          id: chapter.id,
          level: "chapter",
          title: chapter.title,
          position: chapter.position,
          ordinal: labels.chapters.get(chapter.id)?.ordinal ?? 1,
        },
      });
      for (const [sceneIndex, scene] of chapter.scenes.entries()) {
        content.push(
          sceneBlock(
            scene,
            act.id,
            chapter.id,
            sceneIndex === chapter.scenes.length - 1,
            sceneIndex === chapter.scenes.length - 1 && act.chapters.at(-1)?.id === chapter.id,
          ),
        );
      }
    }
  }
  return { type: "doc", content };
}

export function selectionReplacementContent(text: string, inline: boolean) {
  return inline ? text.trim().replace(/\s*\n+\s*/g, " ") : generatedProseContent(text);
}
