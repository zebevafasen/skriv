import type { CompendiumEntry, ManuscriptTree } from "@asterism/contracts";
import { Edit3 } from "lucide-react";
import { CompendiumMentionText } from "./CompendiumMentionText.js";

export type ManuscriptScope =
  | { kind: "story" }
  | { kind: "act"; id: string }
  | { kind: "chapter"; id: string };

export function ContinuousManuscriptView({
  tree,
  scope,
  onEditScene,
  entries,
  onOpenEntry,
}: {
  tree: ManuscriptTree;
  scope: ManuscriptScope;
  onEditScene: (sceneId: string) => void;
  entries: CompendiumEntry[];
  onOpenEntry: (entryIds: string[], direct: boolean) => void;
}) {
  const acts = tree.acts
    .filter((act) => scope.kind !== "act" || act.id === scope.id)
    .map((act) => ({
      ...act,
      chapters: act.chapters.filter(
        (chapter) => scope.kind !== "chapter" || chapter.id === scope.id,
      ),
    }))
    .filter((act) => act.chapters.length > 0 || scope.kind === "act");
  const title =
    scope.kind === "story"
      ? tree.project.title
      : scope.kind === "act"
        ? tree.acts.find((act) => act.id === scope.id)?.title
        : tree.acts.flatMap((act) => act.chapters).find((chapter) => chapter.id === scope.id)
            ?.title;

  return (
    <section className="continuous-manuscript">
      <header>
        <p className="eyebrow">Continuous manuscript</p>
        <h2>{title}</h2>
        <p>Read the selected scope as one flowing manuscript. Scenes remain separate save units.</p>
      </header>
      <div className="manuscript-chunks">
        {acts.map((act) => (
          <section className="act-chunk" key={act.id}>
            <div className="chunk-heading act-heading">
              <span>Act {act.position + 1}</span>
              <h3>{act.title}</h3>
            </div>
            {act.chapters.map((chapter) => (
              <section className="chapter-chunk" key={chapter.id}>
                <div className="chunk-heading chapter-heading">
                  <span>Chapter {chapter.position + 1}</span>
                  <h4>{chapter.title}</h4>
                </div>
                {chapter.scenes.map((scene) => (
                  <article className="scene-chunk" key={scene.id}>
                    <div className="scene-chunk-heading">
                      <div>
                        <span>Scene {scene.position + 1}</span>
                        <h5>{scene.title}</h5>
                      </div>
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => onEditScene(scene.id)}
                      >
                        <Edit3 size={14} /> Edit Scene
                      </button>
                    </div>
                    <div className="scene-chunk-prose">
                      {scene.plainText.trim() ? (
                        scene.plainText.split(/\n\s*\n/).map((paragraph) => (
                          <p key={`${scene.id}-${paragraph}`}>
                            <CompendiumMentionText
                              text={paragraph}
                              entries={entries}
                              onOpenEntry={onOpenEntry}
                            />
                          </p>
                        ))
                      ) : (
                        <p className="empty-prose">This Scene is empty.</p>
                      )}
                    </div>
                  </article>
                ))}
              </section>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}
