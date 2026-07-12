import type { ProjectNote } from "@asterism/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowLeft, Pin, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { ErrorNotice } from "./AppShell.js";
import { useAppDialog } from "./DialogProvider.js";

type NoteSelectionMenu = { top: number; left: number };

function sortNotes(notes: ProjectNote[]) {
  return [...notes].sort(
    (left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function NoteEditor({
  note,
  onBack,
  onSaved,
  onDeleted,
}: {
  note: ProjectNote;
  onBack: () => void;
  onSaved: (note: ProjectNote) => void;
  onDeleted: () => void;
}) {
  const dialog = useAppDialog();
  const [title, setTitle] = useState(note.title);
  const [error, setError] = useState<unknown>(null);
  const [selectionMenu, setSelectionMenu] = useState<NoteSelectionMenu | null>(null);
  const versionRef = useRef(note.version);
  const documentRef = useRef(JSON.stringify(note.document));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueue = useRef<Promise<ProjectNote | null>>(Promise.resolve(null));
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const persist = useCallback(
    (payload: object) => {
      saveQueue.current = saveQueue.current.then(async () => {
        try {
          const updated = await api<ProjectNote>(`/api/notes/${note.id}`, {
            method: "PATCH",
            body: JSON.stringify({ expectedVersion: versionRef.current, ...payload }),
          });
          versionRef.current = updated.version;
          documentRef.current = JSON.stringify(updated.document);
          setTitle(updated.title);
          onSavedRef.current(updated);
          setError(null);
          return updated;
        } catch (saveError) {
          setError(saveError);
          return null;
        }
      });
      return saveQueue.current;
    },
    [note.id],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false }),
      Underline,
      Placeholder.configure({ placeholder: "Start writing this note..." }),
    ],
    content: note.document as JSONContent,
    editorProps: { attributes: { class: "notebook-prose", spellcheck: "true" } },
    onSelectionUpdate({ editor: current }) {
      const { from, to, empty } = current.state.selection;
      if (empty || !current.state.doc.textBetween(from, to, " ").trim()) {
        setSelectionMenu(null);
        return;
      }
      const start = current.view.coordsAtPos(from);
      const end = current.view.coordsAtPos(to);
      const margin = Math.min(190, window.innerWidth / 2);
      setSelectionMenu({
        top: Math.max(12, Math.min(start.top, end.top) - 42),
        left: Math.max(margin, Math.min((start.left + end.right) / 2, window.innerWidth - margin)),
      });
    },
    onUpdate({ editor: current }) {
      const document = current.getJSON();
      if (JSON.stringify(document) === documentRef.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void persist({
          document,
          plainText: current.getText({ blockSeparator: "\n\n" }),
        });
      }, 700);
    },
  });

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (!editor) return;
      const document = editor.getJSON();
      if (JSON.stringify(document) !== documentRef.current) {
        void persist({
          document,
          plainText: editor.getText({ blockSeparator: "\n\n" }),
        });
      }
    },
    [editor, persist],
  );

  return (
    <section className="notebook-editor">
      <header className="notebook-editor-header">
        <button
          type="button"
          className="icon-button mobile-note-back"
          aria-label="Back to notes"
          onClick={onBack}
        >
          <ArrowLeft size={17} />
        </button>
        <input
          aria-label="Note title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => {
            const next = title.trim() || "Untitled Note";
            setTitle(next);
            if (next !== note.title) void persist({ title: next });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <button
          type="button"
          className={`icon-button ${note.pinned ? "active" : ""}`}
          aria-label={note.pinned ? "Unpin note" : "Pin note"}
          title={note.pinned ? "Unpin note" : "Pin note"}
          onClick={() => void persist({ pinned: !note.pinned })}
        >
          <Pin size={15} />
        </button>
        <button
          type="button"
          className="icon-button danger"
          aria-label="Delete note"
          onClick={async () => {
            if (
              !(await dialog.confirm({
                title: `Delete ${title}?`,
                body: "This note will be permanently deleted.",
                confirmLabel: "Delete note",
                destructive: true,
              }))
            )
              return;
            try {
              if (saveTimer.current) clearTimeout(saveTimer.current);
              await saveQueue.current;
              await api(`/api/notes/${note.id}`, { method: "DELETE" });
              onDeleted();
            } catch (deleteError) {
              setError(deleteError);
            }
          }}
        >
          <Trash2 size={15} />
        </button>
      </header>
      {error ? (
        <div className="notebook-conflict">
          <ErrorNotice error={error} />
          <button
            type="button"
            className="button ghost"
            onClick={async () => {
              try {
                const remote = await api<ProjectNote>(`/api/notes/${note.id}`);
                versionRef.current = remote.version;
                documentRef.current = JSON.stringify(remote.document);
                setTitle(remote.title);
                editor?.commands.setContent(remote.document as JSONContent);
                onSavedRef.current(remote);
                setError(null);
              } catch (reloadError) {
                setError(reloadError);
              }
            }}
          >
            Reload server note
          </button>
        </div>
      ) : null}
      <EditorContent editor={editor} />
      {selectionMenu ? (
        <div
          className="note-format-menu"
          role="toolbar"
          aria-label="Note formatting"
          style={{ top: selectionMenu.top, left: selectionMenu.left }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button
            type="button"
            className={editor?.isActive("bold") ? "active" : ""}
            aria-label="Bold"
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={editor?.isActive("italic") ? "active" : ""}
            aria-label="Italic"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className={editor?.isActive("underline") ? "active" : ""}
            aria-label="Underline"
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          >
            <u>U</u>
          </button>
          <button
            type="button"
            aria-label="Heading"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H
          </button>
          <button
            type="button"
            aria-label="Bulleted list"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            List
          </button>
          <button
            type="button"
            aria-label="Blockquote"
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          >
            Quote
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function ProjectNotesPanel({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const notes = useQuery({
    queryKey: ["project-notes", projectId],
    queryFn: () => api<ProjectNote[]>(`/api/projects/${projectId}/notes`),
  });
  const create = useMutation({
    mutationFn: () =>
      api<ProjectNote>(`/api/projects/${projectId}/notes`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (note) => {
      client.setQueryData<ProjectNote[]>(["project-notes", projectId], (current = []) =>
        sortNotes([note, ...current]),
      );
      setSelectedId(note.id);
    },
  });

  useEffect(() => {
    if (!selectedId && notes.data?.[0] && !window.matchMedia("(max-width: 700px)").matches)
      setSelectedId(notes.data[0].id);
  }, [notes.data, selectedId]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return notes.data ?? [];
    return (notes.data ?? []).filter(
      (note) =>
        note.title.toLocaleLowerCase().includes(query) ||
        note.plainText.toLocaleLowerCase().includes(query),
    );
  }, [notes.data, search]);
  const selected = notes.data?.find((note) => note.id === selectedId) ?? null;
  const updateCache = (updated: ProjectNote) => {
    client.setQueryData<ProjectNote[]>(["project-notes", projectId], (current = []) =>
      sortNotes(current.map((note) => (note.id === updated.id ? updated : note))),
    );
  };

  return (
    <div className={`project-notebook ${selected ? "note-selected" : ""}`}>
      <aside className="notebook-sidebar">
        <div className="notebook-sidebar-heading">
          <div>
            <p className="eyebrow">Project notebook</p>
            <h2>Notes</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Create note"
            onClick={() => create.mutate()}
          >
            <Plus size={17} />
          </button>
        </div>
        <label className="notebook-search">
          <Search size={14} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search notes"
          />
        </label>
        {notes.error || create.error ? <ErrorNotice error={notes.error ?? create.error} /> : null}
        <div className="notebook-note-list">
          {filtered.map((note) => (
            <button
              key={note.id}
              type="button"
              className={note.id === selectedId ? "active" : ""}
              onClick={() => setSelectedId(note.id)}
            >
              <span>
                {note.pinned ? <Pin size={11} /> : null}
                <strong>{note.title}</strong>
              </span>
              <small>{note.plainText.trim().slice(0, 90) || "Empty note"}</small>
            </button>
          ))}
          {!notes.isLoading && filtered.length === 0 ? (
            <div className="notebook-empty-list">
              <p>{search ? "No notes match your search." : "No notes yet."}</p>
              {!search ? (
                <button type="button" className="button primary" onClick={() => create.mutate()}>
                  <Plus size={14} /> Create a note
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
      <main className="notebook-main">
        {selected ? (
          <NoteEditor
            key={selected.id}
            note={selected}
            onBack={() => setSelectedId(null)}
            onSaved={updateCache}
            onDeleted={() => {
              client.setQueryData<ProjectNote[]>(["project-notes", projectId], (current = []) =>
                current.filter((note) => note.id !== selected.id),
              );
              setSelectedId(null);
            }}
          />
        ) : (
          <div className="notebook-empty-editor">
            <h2>Select a note</h2>
            <p>Choose a note from the notebook or create a new one.</p>
          </div>
        )}
      </main>
    </div>
  );
}
