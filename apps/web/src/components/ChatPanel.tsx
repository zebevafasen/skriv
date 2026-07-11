import type {
  ChatContextSource,
  ChatMessage,
  ChatThread,
  CompendiumEntry,
  ManuscriptTree,
} from "@asterism/contracts";
import { findMentions } from "@asterism/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { api, streamChat } from "../api.js";
import { CompendiumMentionText } from "./CompendiumMentionText.js";
import { ModelSelect } from "./ModelSelect.js";

const sourceKey = (source: ChatContextSource) =>
  source.kind + ("id" in source ? `:${source.id}` : "typeId" in source ? `:${source.typeId}` : "");
const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
const entryTypeLabel = (typeId: string) =>
  ({
    "story.character": "Characters",
    "story.location": "Locations",
    "story.object": "Objects",
    "story.faction": "Factions",
    "story.lore": "Lore",
    "project.premise": "Project",
    "project.genres": "Project",
    "project.themes": "Project",
    "project.tags": "Project",
    "project.instructions": "Project",
  })[typeId] ?? "Others";

function RichMessage({
  message,
  entries,
  onOpenEntry,
}: {
  message: ChatMessage;
  entries: CompendiumEntry[];
  onOpenEntry: (ids: string[]) => void;
}) {
  const mentionNodes = (node: ReactNode): ReactNode => {
    if (typeof node === "string")
      return (
        <CompendiumMentionText
          text={node}
          entries={entries}
          includeUntracked={message.role === "user"}
          onOpenEntry={(ids) => onOpenEntry(ids)}
        />
      );
    if (Array.isArray(node)) return Children.map(node, mentionNodes);
    if (isValidElement<{ children?: ReactNode }>(node) && node.props.children)
      return cloneElement(node, { children: mentionNodes(node.props.children) });
    return node;
  };
  return (
    <div className="chat-markdown">
      <Markdown
        rehypePlugins={[rehypeSanitize]}
        components={{
          p: ({ children }) => <p>{mentionNodes(children)}</p>,
          li: ({ children }) => <li>{mentionNodes(children)}</li>,
        }}
      >
        {message.content}
      </Markdown>
    </div>
  );
}

function MentionComposer({
  value,
  entries,
  onChange,
  onKeyDown,
}: {
  value: string;
  entries: CompendiumEntry[];
  onChange: (value: string) => void;
  onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement>;
}) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const matches = findMentions(value, entries, { includeUntracked: true });
  const pieces: ReactNode[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.from > cursor) pieces.push(value.slice(cursor, match.from));
    pieces.push(<mark key={`${match.from}-${match.to}`}>{value.slice(match.from, match.to)}</mark>);
    cursor = match.to;
  }
  if (cursor < value.length) pieces.push(value.slice(cursor));
  return (
    <div className="chat-input-layer">
      <div ref={highlightRef} className="chat-input-highlights" aria-hidden="true">
        {pieces}
        {value.endsWith("\n") ? " " : null}
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ask anything about this project..."
        onKeyDown={onKeyDown}
        onScroll={(event) => {
          if (highlightRef.current) {
            highlightRef.current.scrollTop = event.currentTarget.scrollTop;
            highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
          }
        }}
      />
    </div>
  );
}

export function ChatPanel({
  projectId,
  tree,
  entries,
  models,
  baseModel,
  onOpenEntry,
}: {
  projectId: string;
  tree: ManuscriptTree;
  entries: CompendiumEntry[];
  models: Array<{ id: string; name: string }>;
  baseModel: string;
  onOpenEntry: (ids: string[]) => void;
}) {
  const client = useQueryClient();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [warning, setWarning] = useState("");
  const [homeError, setHomeError] = useState("");
  const [creatingThread, setCreatingThread] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextSubmenu, setContextSubmenu] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const threads = useQuery({
    queryKey: ["chat-threads", projectId],
    queryFn: () => api<ChatThread[]>(`/api/projects/${projectId}/chat/threads`),
  });
  const thread = useQuery({
    queryKey: ["chat-thread", threadId],
    queryFn: () => api<ChatThread>(`/api/chat/threads/${threadId}`),
    enabled: Boolean(threadId),
  });
  const createThread = async () => {
    setHomeError("");
    setCreatingThread(true);
    try {
      const latestModel = localStorage.getItem("asterism-latest-model") ?? baseModel;
      const created = await api<ChatThread>(`/api/projects/${projectId}/chat/threads`, {
        method: "POST",
        body: JSON.stringify({ model: latestModel }),
      });
      await client.invalidateQueries({ queryKey: ["chat-threads", projectId] });
      setThreadId(created.id);
    } catch (error) {
      setHomeError(
        error instanceof Error
          ? `${error.message} If this deployment was recently updated, apply the latest database migrations.`
          : "The thread could not be created. Apply the latest database migrations and try again.",
      );
    } finally {
      setCreatingThread(false);
    }
  };
  const patchThread = async (
    input: Partial<Pick<ChatThread, "title" | "model" | "contextSources">>,
  ) => {
    if (!threadId) return;
    const updated = await api<ChatThread>(`/api/chat/threads/${threadId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    client.setQueryData(["chat-thread", threadId], (old: ChatThread | undefined) =>
      old ? { ...old, ...updated, messages: old.messages } : updated,
    );
    await client.invalidateQueries({ queryKey: ["chat-threads", projectId] });
  };
  const applyEvent = (event: import("@asterism/contracts").ChatStreamEvent) => {
    client.setQueryData<ChatThread>(["chat-thread", threadId], (old) => {
      if (!old) return old;
      if (event.type === "chat.started")
        return {
          ...old,
          messages: [...(old.messages ?? []), event.userMessage, event.assistantMessage],
        };
      if (event.type === "chat.delta")
        return {
          ...old,
          messages: (old.messages ?? []).map((m) =>
            m.id === event.messageId ? { ...m, content: m.content + event.delta } : m,
          ),
        };
      if (event.type === "chat.completed") {
        if (event.warnings.length) setWarning(event.warnings.join(" "));
        return {
          ...old,
          messages: (old.messages ?? []).map((m) =>
            m.id === event.message.id ? event.message : m,
          ),
        };
      }
      if (event.type === "chat.cancelled")
        return {
          ...old,
          messages: (old.messages ?? []).map((m) =>
            m.id === event.messageId ? { ...m, status: "cancelled" } : m,
          ),
        };
      if (event.type === "chat.failed") {
        setWarning(event.message);
        return {
          ...old,
          messages: (old.messages ?? []).map((m) =>
            m.id === event.messageId
              ? { ...m, status: "failed", failureMessage: event.message }
              : m,
          ),
        };
      }
      return old;
    });
  };
  const send = async () => {
    const text = draft.trim();
    if (!threadId || !text || streaming) return;
    setDraft("");
    setWarning("");
    setStreaming(true);
    controller.current = new AbortController();
    try {
      await streamChat(
        `/api/chat/threads/${threadId}/messages`,
        text,
        applyEvent,
        controller.current.signal,
      );
    } catch (error) {
      if (!controller.current.signal.aborted)
        setWarning(error instanceof Error ? error.message : "Chat failed.");
    } finally {
      setStreaming(false);
      controller.current = null;
      await client.invalidateQueries({ queryKey: ["chat-threads", projectId] });
    }
  };
  const sources = thread.data?.contextSources ?? [];
  const sourceKeys = new Set(sources.map(sourceKey));
  const toggleSource = (source: ChatContextSource) => {
    setContextOpen(false);
    setContextSubmenu(null);
    return patchThread({
      contextSources: sourceKeys.has(sourceKey(source))
        ? sources.filter((item) => sourceKey(item) !== sourceKey(source))
        : [...sources, source],
    });
  };
  const sourceOptions = useMemo(
    () => [
      { label: "Full manuscript", source: { kind: "manuscript" } as ChatContextSource },
      { label: "Full outline", source: { kind: "outline" } as ChatContextSource },
      ...tree.acts.flatMap((act) => [
        { label: `Act · ${act.title}`, source: { kind: "act", id: act.id } as ChatContextSource },
        ...act.chapters.flatMap((chapter) => [
          {
            label: `Chapter · ${chapter.title}`,
            source: { kind: "chapter", id: chapter.id } as ChatContextSource,
          },
          ...chapter.scenes.map((scene) => ({
            label: `Scene · ${scene.title}`,
            source: { kind: "scene", id: scene.id } as ChatContextSource,
          })),
        ]),
      ]),
      { label: "All Compendium entries", source: { kind: "compendium_all" } as ChatContextSource },
      ...[...new Set(entries.map((e) => e.typeId))].map((typeId) => ({
        label: `Entries · ${typeId.replace("story.", "")}`,
        source: { kind: "compendium_type", typeId } as ChatContextSource,
      })),
      ...entries.map((entry) => ({
        label: `Entry · ${entry.name}`,
        source: { kind: "compendium_entry", id: entry.id } as ChatContextSource,
      })),
    ],
    [tree, entries],
  );
  const contextGroups = useMemo(
    () => [
      {
        id: "acts",
        label: "Acts",
        items: tree.acts.map((act) => ({
          label: act.title,
          group: "Story structure",
          detail: `${act.chapters.length} ${act.chapters.length === 1 ? "chapter" : "chapters"}`,
          source: { kind: "act", id: act.id } as ChatContextSource,
        })),
      },
      {
        id: "chapters",
        label: "Chapters",
        items: tree.acts.flatMap((act) =>
          act.chapters.map((chapter) => ({
            label: chapter.title,
            group: act.title,
            detail: act.title,
            source: { kind: "chapter", id: chapter.id } as ChatContextSource,
          })),
        ),
      },
      {
        id: "scenes",
        label: "Scenes",
        items: tree.acts.flatMap((act) =>
          act.chapters.flatMap((chapter) =>
            chapter.scenes.map((scene) => ({
              label: scene.title || "Untitled Scene",
              group: chapter.title,
              detail: chapter.title,
              source: { kind: "scene", id: scene.id } as ChatContextSource,
            })),
          ),
        ),
      },
      {
        id: "entries",
        label: "Compendium Entries",
        items: entries.map((entry) => ({
          label: entry.name,
          group: entryTypeLabel(entry.typeId),
          detail: entry.typeId.replace("story.", ""),
          source: { kind: "compendium_entry", id: entry.id } as ChatContextSource,
        })),
      },
      {
        id: "types",
        label: "Entries by Type",
        items: [...new Set(entries.map((entry) => entry.typeId))].map((typeId) => ({
          label: typeId.replace("story.", ""),
          group: "Entry types",
          detail: `${entries.filter((entry) => entry.typeId === typeId).length} entries`,
          source: { kind: "compendium_type", typeId } as ChatContextSource,
        })),
      },
    ],
    [tree, entries],
  );
  const latestMessage = thread.data?.messages?.at(-1);
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({
      block: "end",
      behavior: streaming ? "auto" : "smooth",
    });
  }, [latestMessage?.content, latestMessage?.id, streaming]);
  if (!threadId)
    return (
      <section className="chat-home">
        <div className="chat-home-heading">
          <MessageCircle size={28} />
          <h2>Continue where you left off</h2>
          <button
            className="button primary"
            type="button"
            onClick={createThread}
            disabled={creatingThread}
          >
            <Plus size={15} /> {creatingThread ? "Creating..." : "New thread"}
          </button>
        </div>
        {(homeError || threads.error) && (
          <div className="notice error chat-home-error">
            {homeError ||
              `${threads.error instanceof Error ? threads.error.message : "Chat threads could not be loaded."} If this deployment was recently updated, apply the latest database migrations.`}
          </div>
        )}
        {threads.data?.length ? (
          <div className="chat-thread-list">
            {threads.data.map((item) => (
              <button type="button" key={item.id} onClick={() => setThreadId(item.id)}>
                <strong>{item.title}</strong>
                <small>{formatDate(item.updatedAt)}</small>
              </button>
            ))}
          </div>
        ) : (
          <p className="chat-empty">
            Start a conversation about your characters, setting, plot, or manuscript.
          </p>
        )}
      </section>
    );
  if (!thread.data) return <div className="loading">Opening thread...</div>;
  return (
    <section className="chat-workspace">
      <header className="chat-header">
        <button className="button ghost" type="button" onClick={() => setThreadId(null)}>
          All threads
        </button>
        <div>
          <h2>{thread.data.title}</h2>
          <small>{formatDate(thread.data.updatedAt)}</small>
        </div>
        <button
          className="icon-button"
          type="button"
          title="Rename"
          onClick={() => {
            const title = window.prompt("Thread title", thread.data?.title);
            if (title?.trim()) void patchThread({ title: title.trim() });
          }}
        >
          <Pencil size={15} />
        </button>
        <button
          className="icon-button danger"
          type="button"
          title="Delete"
          onClick={async () => {
            if (!window.confirm("Delete this chat thread?")) return;
            await api(`/api/chat/threads/${threadId}`, { method: "DELETE" });
            setThreadId(null);
            await client.invalidateQueries({ queryKey: ["chat-threads", projectId] });
          }}
        >
          <Trash2 size={15} />
        </button>
      </header>
      <div className="chat-messages">
        <div className="chat-messages-inner">
          {(thread.data.messages ?? []).map((message) => (
            <article key={message.id} className={`chat-message ${message.role}`}>
              <div className="chat-message-meta">
                <strong>{message.role === "user" ? "You" : "Asterism"}</strong>
                <button
                  type="button"
                  title="Copy"
                  onClick={() => navigator.clipboard.writeText(message.content)}
                >
                  <Copy size={13} />
                </button>
              </div>
              <RichMessage message={message} entries={entries} onOpenEntry={onOpenEntry} />
              {message.status !== "completed" && (
                <small>
                  {message.status}
                  {message.failureMessage ? ` · ${message.failureMessage}` : ""}
                </small>
              )}
            </article>
          ))}
          <div ref={messageEndRef} className="chat-scroll-anchor" />
        </div>
      </div>
      {warning && <div className="notice error">{warning}</div>}
      <div className="chat-composer">
        <div className="chat-context-picker">
          <button
            type="button"
            className={`chat-context-trigger ${contextOpen ? "active" : ""}`}
            onClick={() => setContextOpen((open) => !open)}
            aria-expanded={contextOpen}
          >
            <Plus size={14} /> Context {sources.length > 0 && <span>{sources.length}</span>}{" "}
            <ChevronDown size={14} />
          </button>
          {contextOpen && (
            <div className="chat-context-menu">
              <div className="chat-context-toolbar">
                <div>
                  <strong>Add project context</strong>
                  <small>Selections stay active for this thread</small>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setContextOpen(false);
                    void patchThread({ contextSources: [] });
                  }}
                >
                  Clear selection
                </button>
              </div>
              {sourceOptions.slice(0, 2).map(({ label, source }) => (
                <button
                  className="chat-context-option"
                  type="button"
                  key={sourceKey(source)}
                  onClick={() => toggleSource(source)}
                >
                  <span>{label}</span>
                  {sourceKeys.has(sourceKey(source)) && <Check size={15} />}
                </button>
              ))}
              <div className="chat-context-divider" />
              {contextGroups.map((group) => (
                <button
                  className={`chat-context-option chat-context-category ${contextSubmenu === group.id ? "active" : ""}`}
                  type="button"
                  key={group.id}
                  onClick={() => setContextSubmenu(group.id)}
                  onMouseEnter={() => setContextSubmenu(group.id)}
                >
                  <span>{group.label}</span>
                  <span className="chat-context-category-meta">
                    {group.items.length}
                    <ChevronRight size={15} />
                  </span>
                </button>
              ))}
              <button
                className="chat-context-option"
                type="button"
                onClick={() => toggleSource({ kind: "compendium_all" })}
              >
                <span>All Compendium Entries</span>
                {sourceKeys.has("compendium_all") && <Check size={15} />}
              </button>
              {contextSubmenu && (
                <div className="chat-context-submenu">
                  <div className="chat-context-submenu-title">
                    {contextGroups.find((group) => group.id === contextSubmenu)?.label}
                  </div>
                  {contextGroups
                    .find((group) => group.id === contextSubmenu)
                    ?.items.map((item, index, items) => (
                      <Fragment key={sourceKey(item.source)}>
                        {(index === 0 || items[index - 1]?.group !== item.group) && (
                          <div className="chat-context-group-label">{item.group}</div>
                        )}
                        <button
                          className="chat-context-option"
                          type="button"
                          onClick={() => toggleSource(item.source)}
                        >
                          <span>
                            <strong>{item.label}</strong>
                            <small>{item.detail}</small>
                          </span>
                          {sourceKeys.has(sourceKey(item.source)) && <Check size={15} />}
                        </button>
                      </Fragment>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
        {sources.length > 0 && (
          <div className="chat-context-chips">
            {sources.map((source) => (
              <button type="button" key={sourceKey(source)} onClick={() => toggleSource(source)}>
                {sourceOptions.find((item) => sourceKey(item.source) === sourceKey(source))
                  ?.label ?? source.kind}
                <X size={12} />
              </button>
            ))}
          </div>
        )}
        <MentionComposer
          value={draft}
          entries={entries}
          onChange={setDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="chat-composer-footer">
          <div className="chat-model">
            <ModelSelect
              value={thread.data.model}
              onChange={(model) => {
                localStorage.setItem("asterism-latest-model", model);
                void patchThread({ model });
              }}
              models={models}
              placement="top"
            />
          </div>
          {(thread.data.messages ?? []).at(-1)?.role === "assistant" && !streaming && (
            <button
              className="button ghost"
              type="button"
              onClick={async () => {
                setStreaming(true);
                try {
                  await streamChat(`/api/chat/threads/${threadId}/regenerate`, null, applyEvent);
                } finally {
                  setStreaming(false);
                }
              }}
            >
              <RefreshCw size={14} /> Regenerate
            </button>
          )}
          {streaming ? (
            <button
              className="button"
              type="button"
              onClick={() => {
                controller.current?.abort();
                void api(`/api/chat/threads/${threadId}/stop`, { method: "POST" });
              }}
            >
              <Square size={13} /> Stop
            </button>
          ) : (
            <button
              className="button primary"
              type="button"
              disabled={!draft.trim()}
              onClick={send}
            >
              <Send size={14} /> Send
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
