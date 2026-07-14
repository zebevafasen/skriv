import type { ManuscriptTree, Scene } from "@asterism/contracts";

export function candidateControlsLayout(editorBounds: { left: number; width: number }) {
  return {
    centerX: editorBounds.left + editorBounds.width / 2,
    editorWidth: editorBounds.width,
  };
}

export function updateSceneInTree(tree: ManuscriptTree, updated: Scene): ManuscriptTree {
  return {
    ...tree,
    acts: tree.acts.map((act) => ({
      ...act,
      chapters: act.chapters.map((chapter) => ({
        ...chapter,
        scenes: chapter.scenes.map((scene) => (scene.id === updated.id ? updated : scene)),
      })),
    })),
  };
}
