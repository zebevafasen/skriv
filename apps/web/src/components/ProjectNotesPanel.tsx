import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { Project } from "@asterism/contracts";
import { api } from "../api.js";

export function ProjectNotesPanel({
  projectId,
  project,
}: {
  projectId: string;
  project: Project;
}) {
  const client = useQueryClient();
  const [notes, setNotes] = useState(project.settings.notes ?? "");

  // Update notes if project changes externally
  useEffect(() => {
    setNotes(project.settings.notes ?? "");
  }, [project.settings.notes]);

  const saveNotes = useCallback(async (value: string) => {
    if (value === project.settings.notes) return;
    await api(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ settings: { notes: value } }),
    });
    await client.invalidateQueries({ queryKey: ["project-tree", projectId] });
  }, [projectId, project.settings.notes, client]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <textarea
        style={{
          flex: 1,
          resize: "none",
          width: "100%",
          padding: "32px max(5vw, 24px)",
          border: "none",
          background: "transparent",
          color: "inherit",
          fontFamily: "inherit",
          fontSize: "1rem",
          outline: "none",
          lineHeight: 1.6,
        }}
        placeholder="Type your project notes here..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={(e) => saveNotes(e.target.value)}
      />
    </div>
  );
}
