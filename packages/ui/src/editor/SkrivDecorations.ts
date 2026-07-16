import { type Editor, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

type DecorationState = {
  candidate:
    | { kind: "insertion"; position: number; text: string }
    | { kind: "replacement"; from: number; to: number; text: string }
    | null;
};
const key = new PluginKey<DecorationState>("skrivDecorations");

export const SkrivDecorations = Extension.create({
  name: "skrivDecorations",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationState>({
        key,
        state: {
          init: () => ({ candidate: null }),
          apply(transaction, previous) {
            const metadata = transaction.getMeta(key) as Partial<DecorationState> | undefined;
            const mappedCandidate = previous.candidate
              ? previous.candidate.kind === "insertion"
                ? {
                    ...previous.candidate,
                    position: transaction.mapping.map(previous.candidate.position),
                  }
                : {
                    ...previous.candidate,
                    from: transaction.mapping.map(previous.candidate.from),
                    to: transaction.mapping.map(previous.candidate.to),
                  }
              : null;
            return {
              candidate:
                metadata && "candidate" in metadata
                  ? (metadata.candidate ?? null)
                  : mappedCandidate,
            };
          },
        },
        props: {
          decorations(state) {
            const pluginState = key.getState(state);
            if (!pluginState) return DecorationSet.empty;
            const decorations: Decoration[] = [];
            if (pluginState.candidate) {
              const candidate = pluginState.candidate;
              const position = candidate.kind === "insertion" ? candidate.position : candidate.from;
              if (candidate.kind === "replacement") {
                decorations.push(
                  Decoration.inline(candidate.from, candidate.to, {
                    class: "temporary-generation-source",
                  }),
                );
              }
              decorations.push(
                Decoration.widget(
                  Math.min(position, state.doc.content.size),
                  () => {
                    const wrapper = document.createElement("span");
                    wrapper.className = "temporary-generation";
                    wrapper.dataset.testid = "temporary-generation";
                    if (!candidate.text) {
                      wrapper.textContent = "Thinking…";
                    } else {
                      const paragraphs = candidate.text.split(/\n\s*\n/);
                      paragraphs.forEach((paragraph, index) => {
                        const part = document.createElement("span");
                        part.className = "temporary-generation-paragraph";
                        part.textContent = paragraph;
                        wrapper.append(part);
                        if (index < paragraphs.length - 1) {
                          wrapper.append(document.createElement("br"));
                          wrapper.append(document.createElement("br"));
                        }
                      });
                    }
                    return wrapper;
                  },
                  { side: 1, key: `candidate-${candidate.text.length}` },
                ),
              );
            }
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

export function setCandidateDecoration(
  editor: Editor,
  candidate: DecorationState["candidate"],
): void {
  editor.view.dispatch(editor.state.tr.setMeta(key, { candidate }).setMeta("addToHistory", false));
}
