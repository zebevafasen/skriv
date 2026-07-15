import type {
  ChatContextSource,
  ChatMessage,
  ChatThread,
  CompendiumEntry,
  ManuscriptTree,
} from "@skriv/contracts";
import { manuscriptLabels } from "@skriv/core";
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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { ApiError, skriv } from "../api.js";
import { CompendiumMentionText } from "./CompendiumMentionText.js";
import { useAppDialog } from "./DialogProvider.js";
import { MentionTextarea } from "./MentionTextarea.js";
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
  return (
    <MentionTextarea
      wrapperClassName="chat-input-layer"
      value={value}
      entries={entries}
      spellCheck={false}
      onValueChange={onChange}
      placeholder="Ask anything about this project..."
      onKeyDown={onKeyDown}
    />
  );
}

export function ChatPanel({
  aiConfigured,
  projectId,
  tree,
  entries,
  models,
  baseModel,
  onOpenEntry,
  threadId,
  onThreadChange,
}: {
  aiConfigured: boolean;
  projectId: string;
  tree: ManuscriptTree;
  entries: CompendiumEntry[];
  models: Array<{ id: string; name: string }>;
  baseModel: string;
  onOpenEntry: (ids: string[]) => void;
  threadId: string | null;
  onThreadChange: (id: string | null) => void;
}) {
  const client = useQueryClient();
  const categories = useQuery({
    queryKey: ["compendium-categories", projectId],
    queryFn: () => skriv().compendium.categories(projectId),
  });
  const dialog = useAppDialog();
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [warning, setWarning] = useState("");
  const [homeError, setHomeError] = useState("");
  const [creatingThread, setCreatingThread] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextSubmenu, setContextSubmenu] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const replacements = useRef(new Set<string>());
  const messageEndRef = useRef<HTMLDivElement>(null);
  const threads = useQuery({
    queryKey: ["chat-threads", projectId],
    queryFn: () => skriv().chat.list(projectId),
  });
  const thread = useQuery({
    queryKey: ["chat-thread", threadId],
    queryFn: () => skriv().chat.get(threadId as string),
    enabled: Boolean(threadId),
  });
  useEffect(() => {
    if (thread.error instanceof ApiError && thread.error.code === "NOT_FOUND") onThreadChange(null);
  }, [onThreadChange, thread.error]);
  const createThread = async () => {
    setHomeError("");
    setCreatingThread(true);
    try {
      const latestModel = localStorage.getItem("skriv-latest-model") ?? baseModel;
      const created = await skriv().chat.create(projectId, latestModel);
      await client.invalidateQueries({ queryKey: ["chat-threads", projectId] });
      onThreadChange(created.id);
    } catch (error) {
      setHomeError(error instanceof Error ? error.message : "The thread could not be created.");
    } finally {
      setCreatingThread(false);
    }
  };
  const patchThread = async (
    input: Partial<Pick<ChatThread, "title" | "model" | "contextSources">>,
  ) => {
    if (!threadId) return;
    const updated = await skriv().chat.update(threadId, input);
    client.setQueryData(["chat-thread", threadId], (old: ChatThread | undefined) =>
      old ? { ...old, ...updated, messages: old.messages } : updated,
    );
    await client.invalidateQueries({ queryKey: ["chat-threads", projectId] });
  };
  const applyEvent = (event: import("@skriv/contracts").ChatStreamEvent) => {
    client.setQueryData<ChatThread>(["chat-thread", threadId], (old) => {
      if (!old) return old;
      if (event.type === "chat.started") {
        if (event.replacedMessageId) replacements.current.add(event.assistantMessage.id);
        return {
          ...old,
          messages: event.replacedMessageId
            ? [
                ...(old.messages ?? []).filter((message) => message.id !== event.replacedMessageId),
                event.assistantMessage,
              ]
            : [...(old.messages ?? []), event.userMessage, event.assistantMessage],
        };
      }
      if (event.type === "chat.delta")
        return {
          ...old,
          messages: (old.messages ?? []).map((m) =>
            m.id === event.messageId ? { ...m, content: m.content + event.delta } : m,
          ),
        };
      if (event.type === "chat.completed") {
        replacements.current.delete(event.message.id);
        if (event.warnings.length) setWarning(event.warnings.join(" "));
        return {
          ...old,
          messages: (old.messages ?? []).map((m) =>
            m.id === event.message.id ? event.message : m,
          ),
        };
      }
      if (event.type === "chat.cancelled") {
        if (replacements.current.delete(event.messageId))
          void client.invalidateQueries({ queryKey: ["chat-thread", threadId] });
        return {
          ...old,
          messages: (old.messages ?? []).map((m) =>
            m.id === event.messageId ? { ...m, status: "cancelled" } : m,
          ),
        };
      }
      if (event.type === "chat.failed") {
        if (replacements.current.delete(event.messageId))
          void client.invalidateQueries({ queryKey: ["chat-thread", threadId] });
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
    if (!aiConfigured || !threadId || !text || streaming) return;
    setDraft("");
    setWarning("");
    setStreaming(true);
    controller.current = new AbortController();
    try {
      await skriv().chat.send(threadId, text, applyEvent, controller.current.signal);
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
  const structureLabels = useMemo(() => manuscriptLabels(tree), [tree]);
  const typeLabel = useCallback(
    (typeId: string) =>
      categories.data?.find((category) => `custom.${category.id}` === typeId)?.name ??
      entryTypeLabel(typeId),
    [categories.data],
  );
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
        {
          label: structureLabels.acts.get(act.id)?.label ?? "Act",
          source: { kind: "act", id: act.id } as ChatContextSource,
        },
        ...act.chapters.flatMap((chapter) => [
          {
            label: structureLabels.chapters.get(chapter.id)?.label ?? "Chapter",
            source: { kind: "chapter", id: chapter.id } as ChatContextSource,
          },
          ...chapter.scenes.map((scene) => ({
            label: structureLabels.scenes.get(scene.id)?.label ?? "Scene",
            source: { kind: "scene", id: scene.id } as ChatContextSource,
          })),
        ]),
      ]),
      { label: "All Compendium entries", source: { kind: "compendium_all" } as ChatContextSource },
      ...[...new Set(entries.map((e) => e.typeId))].map((typeId) => ({
        label: `Entries · ${typeLabel(typeId)}`,
        source: { kind: "compendium_type", typeId } as ChatContextSource,
      })),
      ...entries.map((entry) => ({
        label: `Entry · ${entry.name}`,
        source: { kind: "compendium_entry", id: entry.id } as ChatContextSource,
      })),
    ],
    [tree, entries, structureLabels, typeLabel],
  );
  const contextGroups = useMemo(
    () => [
      {
        id: "acts",
        label: "Acts",
        items: tree.acts.map((act) => ({
          label: structureLabels.acts.get(act.id)?.label ?? "Act",
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
            label: structureLabels.chapters.get(chapter.id)?.label ?? "Chapter",
            group: structureLabels.acts.get(act.id)?.label ?? "Act",
            detail: structureLabels.acts.get(act.id)?.label ?? "Act",
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
              label: structureLabels.scenes.get(scene.id)?.label ?? "Scene",
              group: structureLabels.chapters.get(chapter.id)?.label ?? "Chapter",
              detail: structureLabels.chapters.get(chapter.id)?.label ?? "Chapter",
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
          group: typeLabel(entry.typeId),
          detail: typeLabel(entry.typeId),
          source: { kind: "compendium_entry", id: entry.id } as ChatContextSource,
        })),
      },
      {
        id: "types",
        label: "Entries by Type",
        items: [...new Set(entries.map((entry) => entry.typeId))].map((typeId) => ({
          label: typeLabel(typeId),
          group: "Entry types",
          detail: `${entries.filter((entry) => entry.typeId === typeId).length} entries`,
          source: { kind: "compendium_type", typeId } as ChatContextSource,
        })),
      },
    ],
    [tree, entries, structureLabels, typeLabel],
  );
  const latestMessage = thread.data?.messages?.at(-1);
  useEffect(() => {
    if (!latestMessage) return;
    messageEndRef.current?.scrollIntoView({
      block: "end",
      behavior: streaming ? "auto" : "smooth",
    });
  }, [latestMessage, streaming]);
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
              (threads.error instanceof Error
                ? threads.error.message
                : "Chat threads could not be loaded.")}
          </div>
        )}
        {threads.data?.length ? (
          <div className="chat-thread-list">
            {threads.data.map((item) => (
              <button type="button" key={item.id} onClick={() => onThreadChange(item.id)}>
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
        <button className="button ghost" type="button" onClick={() => onThreadChange(null)}>
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
          aria-label="Rename thread"
          onClick={async () => {
            const title = await dialog.prompt({
              title: "Rename Chat thread",
              label: "Thread title",
              initialValue: thread.data?.title ?? "",
            });
            if (title?.trim()) void patchThread({ title: title.trim() });
          }}
        >
          <Pencil size={15} />
        </button>
        <button
          className="icon-button danger"
          type="button"
          title="Delete"
          aria-label="Delete thread"
          onClick={async () => {
            if (
              !(await dialog.confirm({
                title: `Delete “${thread.data?.title ?? "Chat thread"}”?`,
                body: `This permanently deletes ${(thread.data?.messages ?? []).length} messages. This cannot be undone.`,
                confirmLabel: "Delete thread",
                destructive: true,
              }))
            )
              return;
            await skriv().chat.remove(threadId);
            onThreadChange(null);
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
                <strong>{message.role === "user" ? "You" : "Skriv"}</strong>
                <button
                  type="button"
                  title="Copy"
                  aria-label="Copy message"
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
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              window.matchMedia("(pointer: fine)").matches
            ) {
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
                localStorage.setItem("skriv-latest-model", model);
                void patchThread({ model });
              }}
              models={models}
              placement="top"
            />
          </div>
          {(thread.data.messages ?? []).at(-1)?.role === "assistant" &&
            (thread.data.messages ?? []).at(-1)?.status === "completed" &&
            !streaming && (
              <button
                className="button ghost chat-footer-action"
                type="button"
                disabled={!aiConfigured}
                title={aiConfigured ? "Regenerate response" : "Configure OpenRouter in Settings"}
                onClick={async () => {
                  setStreaming(true);
                  controller.current = new AbortController();
                  try {
                    await skriv().chat.regenerate(
                      threadId,
                      applyEvent,
                      controller.current.signal,
                    );
                  } finally {
                    setStreaming(false);
                    controller.current = null;
                  }
                }}
              >
                <RefreshCw size={14} /> Regenerate
              </button>
            )}
          {streaming ? (
            <button
              className="button chat-footer-action"
              type="button"
              onClick={() => {
                controller.current?.abort();
                void skriv().chat.stop(threadId);
              }}
            >
              <Square size={13} /> Stop
            </button>
          ) : (
            <button
              className="button primary chat-footer-action"
              type="button"
              disabled={!aiConfigured || !draft.trim()}
              title={aiConfigured ? "Send message" : "Configure OpenRouter in Settings"}
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
