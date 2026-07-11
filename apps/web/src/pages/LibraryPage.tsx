import type { Project } from "@asterism/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Plus, Search, Sparkles, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { EmptyState, ErrorNotice } from "../components/AppShell.js";

type CreatedProject = { project: Project; initialSceneId: string };

export function projectArtworkVariant(projectId: string, variants = 5) {
  let hash = 0x811c9dc5;
  for (const character of projectId) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  return (hash >>> 0) % variants;
}

export function LibraryPage() {
  const [query, setQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const navigate = useNavigate();
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/api/projects"),
  });
  const createProject = useMutation({
    mutationFn: (title: string) =>
      api<CreatedProject>("/api/projects", { method: "POST", body: JSON.stringify({ title }) }),
    onSuccess: async ({ project }) => {
      await client.invalidateQueries({ queryKey: ["projects"] });
      await navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    },
  });
  const importProject = useMutation({
    mutationFn: (jsonString: string) =>
      api<CreatedProject>("/api/projects/import", {
        method: "POST",
        body: jsonString,
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: async ({ project }) => {
      await client.invalidateQueries({ queryKey: ["projects"] });
      await navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    },
  });

  const handleImportChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text === "string") {
          importProject.mutate(text);
        }
      } catch (err) {
        console.error("Failed to parse imported project", err);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };
  const filtered = useMemo(
    () =>
      (projects.data ?? []).filter((project) =>
        project.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      ),
    [projects.data, query],
  );

  return (
    <div className="page library-page">
      <section className="page-heading">
        <p className="eyebrow">Your private library</p>
        <h1>Your stories</h1>
        <p>Every world begins somewhere. Continue a manuscript or begin weaving something new.</p>
      </section>
      <div className="library-actions">
        <button type="button" className="button primary" onClick={() => setCreating(true)}>
          <Plus size={18} /> Create story
        </button>
        <button
          type="button"
          className="button ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={importProject.isPending}
        >
          <Upload size={18} /> {importProject.isPending ? "Importing..." : "Import story"}
        </button>
        <input
          type="file"
          accept=".json"
          style={{ display: "none" }}
          ref={fileInputRef}
          onChange={handleImportChange}
        />
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your stories…"
          />
        </label>
      </div>
      {projects.error ? <ErrorNotice error={projects.error} /> : null}
      {importProject.error ? <ErrorNotice error={importProject.error} /> : null}
      {projects.isLoading ? <div className="loading">Gathering your stories…</div> : null}
      {!projects.isLoading && filtered.length === 0 ? (
        <EmptyState
          title="A blank shelf"
          body="Create your first story and Asterism will prepare its opening scene."
        />
      ) : null}
      <section className="project-grid" aria-label="Projects">
        {filtered.map((project) => (
          <Link
            key={project.id}
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="project-card"
          >
            <div className={`project-art art-${projectArtworkVariant(project.id)}`}>
              <Sparkles size={20} />
            </div>
            <div className="project-card-body">
              <h2>{project.title}</h2>
              <p>
                <BookOpen size={14} /> Edited {new Date(project.updatedAt).toLocaleDateString()}
              </p>
              <span>
                Open manuscript <ArrowRight size={14} />
              </span>
            </div>
          </Link>
        ))}
      </section>
      {creating ? (
        <div className="modal-backdrop">
          <form
            className="modal"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (newTitle.trim()) createProject.mutate(newTitle.trim());
            }}
          >
            <p className="eyebrow">New project</p>
            <h2>Name your story</h2>
            <input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="The Last Ember"
            />
            {createProject.error ? <ErrorNotice error={createProject.error} /> : null}
            <div className="modal-actions">
              <button type="button" className="button ghost" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={!newTitle.trim() || createProject.isPending}
              >
                Create project
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
