import type { CompendiumEntry, SelectionAction, WorkflowKey } from "@asterism/contracts";
import { createContext, useContext } from "react";

export type InsertionGenerationOptions = {
  workflow: Extract<
    WorkflowKey,
    "prose.first_scene" | "prose.start" | "prose.continue" | "prose.toward_event"
  >;
  instructions: string;
  eventTarget: string;
  targetLength: number | null;
  lengthUnit: "words" | "paragraphs";
  modelOverride: string | null;
};

export type SelectionGenerationOptions = {
  workflow: "prose.revise_selection";
  selectionAction: SelectionAction;
  selectedText: string;
  selectionFrom: number;
  selectionTo: number;
  instructions: string;
  eventTarget: "";
  targetLength: number | null;
  lengthUnit: "words";
  modelOverride: string | null;
};

export type GenerationOptions = InsertionGenerationOptions | SelectionGenerationOptions;

export type EditorActionsContextType = {
  aiConfigured: boolean;
  baseModel: string;
  entries: CompendiumEntry[];
  models: Array<{ id: string; name: string }>;
  startGeneration: (options: GenerationOptions, position?: number) => void;
};

export const EditorActionsContext = createContext<EditorActionsContextType | null>(null);

export function useEditorActions() {
  const context = useContext(EditorActionsContext);
  if (!context) {
    throw new Error("useEditorActions must be used within an EditorActionsContext.Provider");
  }
  return context;
}
