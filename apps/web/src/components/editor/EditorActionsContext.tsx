import { createContext, useContext } from "react";
import type { WorkflowKey } from "@asterism/contracts";

export type GenerationOptions = {
  workflow: Extract<WorkflowKey, "prose.start" | "prose.continue" | "prose.toward_event">;
  instructions: string;
  eventTarget: string;
  targetLength: number | null;
  lengthUnit: "words" | "paragraphs";
  modelOverride: string | null;
};

export type EditorActionsContextType = {
  baseModel: string;
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
