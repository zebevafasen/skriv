import type { Project } from "@asterism/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Plus, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api.js";
import { EmptyState, ErrorNotice } from "../components/AppShell.js";

type CreatedProject = { project: Project; initialSceneId: string };

export function LibraryPage() {
  const [query, setQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
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
      {projects.isLoading ? <div className="loading">Gathering your stories…</div> : null}
      {!projects.isLoading && filtered.length === 0 ? (
        <EmptyState
          title="A blank shelf"
          body="Create your first story and Asterism will prepare its opening scene."
        />
      ) : null}
      <section className="project-grid" aria-label="Projects">
        {filtered.map((project, index) => (
          <Link
            key={project.id}
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="project-card"
          >
            <div className={`project-art art-${index % 5}`}>
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
