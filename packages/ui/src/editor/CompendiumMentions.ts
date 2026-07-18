import type { CompendiumEntry } from "@skriv/contracts";
import { type Editor, Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { compendiumMentionMatches } from "../utils/mentions.js";

type CompendiumMentionState = {
  entries: readonly CompendiumEntry[];
  decorations: DecorationSet;
};

type CompendiumMentionMetadata = {
  entries?: readonly CompendiumEntry[];
  refresh?: boolean;
};

export type CompendiumMentionsOptions = {
  entries: readonly CompendiumEntry[];
  includeUntracked: boolean;
  debounceMs: number;
};

const key = new PluginKey<CompendiumMentionState>("compendiumMentions");

function mentionDecorations(
  document: ProseMirrorNode,
  entries: readonly CompendiumEntry[],
  includeUntracked: boolean,
): DecorationSet {
  const decorations: Decoration[] = [];
  document.descendants((node, position) => {
    if (!node.isTextblock) return;
    const text = node.textBetween(0, node.content.size, "\n", "\ufffc");
    for (const match of compendiumMentionMatches(text, entries, { includeUntracked })) {
      decorations.push(
        Decoration.inline(position + 1 + match.from, position + 1 + match.to, {
          class: "compendium-mention",
          nodeName: "mark",
          spellcheck: "false",
          "data-entry-ids": match.entryIds.join(","),
        }),
      );
    }
    return false;
  });
  return DecorationSet.create(document, decorations);
}

export const CompendiumMentions = Extension.create<CompendiumMentionsOptions>({
  name: "compendiumMentions",

  addOptions() {
    return {
      entries: [],
      includeUntracked: false,
      debounceMs: 0,
    };
  },

  addProseMirrorPlugins() {
    const { debounceMs, entries: initialEntries, includeUntracked } = this.options;
    return [
      new Plugin<CompendiumMentionState>({
        key,
        state: {
          init: (_, state) => ({
            entries: initialEntries,
            decorations: mentionDecorations(state.doc, initialEntries, includeUntracked),
          }),
          apply(transaction, previous) {
            const metadata = transaction.getMeta(key) as CompendiumMentionMetadata | undefined;
            const entries = metadata?.entries ?? previous.entries;
            if (
              metadata?.entries ||
              metadata?.refresh ||
              (transaction.docChanged && debounceMs === 0)
            ) {
              return {
                entries,
                decorations: mentionDecorations(transaction.doc, entries, includeUntracked),
              };
            }
            return {
              entries,
              decorations: transaction.docChanged
                ? previous.decorations.map(transaction.mapping, transaction.doc)
                : previous.decorations,
            };
          },
        },
        props: {
          decorations(state) {
            return key.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
        view(editorView) {
          let timer: ReturnType<typeof setTimeout> | null = null;
          return {
            update(view, previousState) {
              if (debounceMs === 0 || view.state.doc.eq(previousState.doc)) return;
              if (timer) clearTimeout(timer);
              timer = setTimeout(() => {
                timer = null;
                if (!editorView.isDestroyed) {
                  editorView.dispatch(editorView.state.tr.setMeta(key, { refresh: true }));
                }
              }, debounceMs);
            },
            destroy() {
              if (timer) clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },
});

export function setCompendiumMentionEntries(
  editor: Editor,
  entries: readonly CompendiumEntry[],
): void {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(key, { entries }).setMeta("addToHistory", false));
}

export function compendiumMentionClick(
  event: MouseEvent,
): { entryIds: string[]; direct: boolean } | undefined {
  const decorated = (event.target as HTMLElement).closest<HTMLElement>("[data-entry-ids]");
  if (!decorated?.dataset.entryIds) return undefined;
  return {
    entryIds: decorated.dataset.entryIds.split(","),
    direct: event.ctrlKey || event.metaKey,
  };
}
