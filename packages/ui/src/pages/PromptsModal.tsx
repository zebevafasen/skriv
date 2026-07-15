import {
  type PromptDefinition,
  type PromptMessage,
  type WorkflowKey,
  workflowVariables,
} from "@skriv/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileInput, LockKeyhole, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { skriv } from "../api.js";
import { EmptyState, ErrorNotice } from "../components/AppShell.js";
import { useAppDialog } from "../components/DialogProvider.js";

type PromptPayload = {
  prompts: PromptDefinition[];
  bindings: Array<{
    workflow: WorkflowKey;
    promptDefinitionId: string | null;
    builtinPromptId: string | null;
  }>;
};

type EditablePrompt = Pick<
  PromptDefinition,
  "name" | "workflow" | "description" | "messages" | "variables" | "sourcePromptId"
>;

type PromptCategory = "prose" | "ideation" | "context" | "summary" | "chat";

const workflowKeys = Object.keys(workflowVariables) as WorkflowKey[];
const promptRoles: PromptMessage["role"][] = ["system", "developer", "user", "assistant"];
const promptCategoryOrder: PromptCategory[] = [
  "prose",
  "ideation",
  "context",
  "summary",
  "chat",
];
const promptCategoryLabels: Record<PromptCategory, string> = {
  prose: "Prose",
  ideation: "Ideation",
  context: "Context",
  summary: "Summary",
  chat: "Chat",
};

const workflowLabels: Record<WorkflowKey, string> = {
  "prose.first_scene": "First scene",
  "prose.start": "Start writing",
  "prose.continue": "Continue writing",
  "prose.toward_event": "Continue toward event",
  "prose.revise_selection": "Revise selection",
  "ideation.premise": "Premise generation",
  "ideation.entity": "Entity ideation",
  "ideation.compendium_extract": "Premise compendium extraction",
  "context.extract": "Smart context extraction",
  "summary.scene": "Scene summary",
  "chat.respond": "Project chat",
  "chat.summarize_history": "Chat history summary",
  "chat.compress_context": "Chat context compression",
};

function blankPrompt(workflow: WorkflowKey = "prose.continue"): EditablePrompt {
  const variables = [...workflowVariables[workflow]];
  return {
    name: "Untitled prompt",
    workflow,
    description: "",
    messages: [
      {
        role: "user",
        content: variables[0] ? `{{${variables[0]}}}` : "Write the requested response.",
      },
    ],
    variables,
    sourcePromptId: null,
  };
}

function promptFromBuiltin(prompt: PromptDefinition): EditablePrompt {
  return {
    name: `${prompt.name.replace(/^Default\s+/i, "")} — Custom`,
    workflow: prompt.workflow,
    description: prompt.description,
    messages: prompt.messages.map((message) => ({ ...message })),
    variables: [...workflowVariables[prompt.workflow]],
    sourcePromptId: prompt.id,
  };
}

function normalizedBuiltinId(id: string): string {
  return id.replace(/^default\./, "builtin.").replace(/\.default$/, "");
}

function promptCategory(workflow: WorkflowKey): PromptCategory {
  return workflow.split(".")[0] as PromptCategory;
}

function PromptFields({
  value,
  onChange,
  disabled = false,
}: {
  value: EditablePrompt;
  onChange: (value: EditablePrompt) => void;
  disabled?: boolean;
}) {
  const availableVariables = workflowVariables[value.workflow];
  const updateMessage = (index: number, next: PromptMessage) =>
    onChange({
      ...value,
      messages: value.messages.map((message, messageIndex) =>
        messageIndex === index ? next : message,
      ),
    });

  return (
    <>
      <label className="prompt-description-field">
        <span>Description</span>
        <textarea
          disabled={disabled}
          value={value.description}
          placeholder="Explain what this prompt is designed to do."
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
      </label>

      <section className="prompt-form-section">
        <div className="prompt-form-section-heading">
          <div>
            <h3>Messages</h3>
            <p>Messages are sent to the model in this order.</p>
          </div>
          {!disabled ? (
            <button
              type="button"
              className="button ghost"
              onClick={() =>
                onChange({
                  ...value,
                  messages: [...value.messages, { role: "user", content: "" }],
                })
              }
            >
              <Plus size={15} /> Add message
            </button>
          ) : null}
        </div>
        <div className="message-stack">
          {value.messages.map((message, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Prompt messages have no persistent IDs.
            <article className="prompt-message-card" key={`${message.role}-${index}`}>
              <div className="prompt-message-toolbar">
                <label>
                  <span>Role</span>
                  <select
                    disabled={disabled}
                    value={message.role}
                    onChange={(event) =>
                      updateMessage(index, {
                        ...message,
                        role: event.target.value as PromptMessage["role"],
                      })
                    }
                  >
                    {promptRoles.map((role) => (
                      <option value={role} key={role}>
                        {role[0]?.toLocaleUpperCase()}
                        {role.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                {!disabled ? (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove message ${index + 1}`}
                    title="Remove message"
                    disabled={value.messages.length === 1}
                    onClick={() =>
                      onChange({
                        ...value,
                        messages: value.messages.filter(
                          (_, messageIndex) => messageIndex !== index,
                        ),
                      })
                    }
                  >
                    <X size={15} />
                  </button>
                ) : null}
              </div>
              <textarea
                disabled={disabled}
                value={message.content}
                placeholder="Prompt instructions and {{variables}}…"
                onChange={(event) =>
                  updateMessage(index, { ...message, content: event.target.value })
                }
              />
            </article>
          ))}
        </div>
      </section>

      <section className="prompt-form-section prompt-variable-section">
        <div className="prompt-form-section-heading">
          <div>
            <h3>Workflow variables</h3>
            <p>Enable the values this prompt may reference.</p>
          </div>
        </div>
        <div className="prompt-variable-grid">
          {availableVariables.map((variable) => {
            const selected = value.variables.includes(variable);
            return (
              <label className="prompt-variable-option" key={variable}>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={selected}
                  onChange={() =>
                    onChange({
                      ...value,
                      variables: selected
                        ? value.variables.filter((item) => item !== variable)
                        : [...value.variables, variable],
                    })
                  }
                />
                <code>{`{{${variable}}}`}</code>
              </label>
            );
          })}
        </div>
      </section>
    </>
  );
}

function PromptListGroup({
  title,
  ownership,
  prompts,
  selectedId,
  onSelect,
}: {
  title: string;
  ownership: "builtin" | "user";
  prompts: PromptDefinition[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const categoryGroups = promptCategoryOrder
    .map((category) => ({
      category,
      prompts: prompts.filter((prompt) => promptCategory(prompt.workflow) === category),
    }))
    .filter((group) => group.prompts.length > 0);

  return (
    <section className="prompt-list-group">
      <header>
        <span>{title}</span>
        <small>{prompts.length}</small>
      </header>
      {prompts.length ? (
        <div className="prompt-category-groups">
          {categoryGroups.map((group) => (
            <section
              className="prompt-category-group"
              aria-label={promptCategoryLabels[group.category]}
              key={group.category}
            >
              <header>
                <span>{promptCategoryLabels[group.category]}</span>
                <small>{group.prompts.length}</small>
              </header>
              <div className="prompt-list-items">
                {group.prompts.map((prompt) => (
                  <button
                    type="button"
                    key={prompt.id}
                    className={prompt.id === selectedId ? "active" : ""}
                    onClick={() => onSelect(prompt.id)}
                  >
                    <span>
                      <strong>{prompt.name}</strong>
                      <em>{ownership === "builtin" ? "BUILTIN" : "CUSTOM"}</em>
                    </span>
                    <small>{workflowLabels[prompt.workflow]}</small>
                    {ownership === "builtin" ? (
                      <code>{normalizedBuiltinId(prompt.id)}</code>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="prompt-list-empty">No custom prompts yet.</p>
      )}
    </section>
  );
}

export function PromptsModal({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const dialog = useAppDialog();
  const query = useQuery({
    queryKey: ["prompts"],
    queryFn: () => skriv().prompts.list() as Promise<PromptPayload>,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createTemplateId, setCreateTemplateId] = useState("blank");
  const [createDraft, setCreateDraft] = useState<EditablePrompt>(() => blankPrompt());
  const selected = query.data?.prompts.find((prompt) => prompt.id === selectedId) ?? null;
  const [draft, setDraft] = useState<PromptDefinition | null>(selected);

  const builtinPrompts = useMemo(
    () =>
      (query.data?.prompts ?? [])
        .filter((prompt) => prompt.ownership === "builtin")
        .sort(
          (left, right) =>
            workflowKeys.indexOf(left.workflow) - workflowKeys.indexOf(right.workflow),
        ),
    [query.data],
  );
  const userPrompts = useMemo(
    () =>
      (query.data?.prompts ?? [])
        .filter((prompt) => prompt.ownership === "user")
        .sort((left, right) => left.name.localeCompare(right.name)),
    [query.data],
  );

  useEffect(() => setDraft(selected), [selected]);
  useEffect(() => {
    if (selectedId && query.data?.prompts.some((prompt) => prompt.id === selectedId)) return;
    const first = userPrompts[0] ?? builtinPrompts[0];
    setSelectedId(first?.id ?? null);
  }, [builtinPrompts, query.data, selectedId, userPrompts]);

  const refresh = () => client.invalidateQueries({ queryKey: ["prompts"] });
  const save = useMutation({
    mutationFn: (prompt: PromptDefinition) =>
      skriv().prompts.update(prompt.id, {
        name: prompt.name,
        description: prompt.description,
        messages: prompt.messages,
        variables: prompt.variables,
      }),
    onSuccess: async (prompt) => {
      await refresh();
      setDraft(prompt);
    },
  });
  const create = useMutation({
    mutationFn: (prompt: EditablePrompt) => skriv().prompts.create(prompt),
    onSuccess: async (prompt) => {
      setCreating(false);
      await refresh();
      setSelectedId(prompt.id);
    },
  });
  const remove = useMutation({
    mutationFn: (promptId: string) => skriv().prompts.remove(promptId),
    onSuccess: async () => {
      setSelectedId(null);
      await refresh();
    },
  });
  const bind = useMutation({
    mutationFn: ({ workflow, promptId }: { workflow: WorkflowKey; promptId: string | null }) =>
      skriv().prompts.bind(workflow, promptId),
    onSuccess: refresh,
  });

  const openCreate = (source?: PromptDefinition) => {
    create.reset();
    setCreateTemplateId(source?.id ?? "blank");
    setCreateDraft(source ? promptFromBuiltin(source) : blankPrompt());
    setCreating(true);
  };

  const binding = draft
    ? query.data?.bindings.find((item) => item.workflow === draft.workflow)
    : null;
  const defaultBuiltin = draft
    ? builtinPrompts.find((prompt) => prompt.workflow === draft.workflow)
    : null;
  const activePromptId =
    binding?.promptDefinitionId ?? binding?.builtinPromptId ?? defaultBuiltin?.id ?? null;
  const isActive = draft?.id === activePromptId;
  const formValid =
    createDraft.name.trim().length > 0 &&
    createDraft.messages.length > 0 &&
    createDraft.messages.every((message) => message.content.trim().length > 0);

  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse convenience
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is not keyboard-interactive
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ zIndex: 50 }}
    >
      <div
        className="modal prompts-page"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        style={{ width: 'min(1400px, calc(100% - 30px))', maxHeight: '85vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }}
      >
        <section className="page-heading prompt-page-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ marginTop: 0 }}>Prompt Registry</h1>
            <p>Inspect built-in instructions and tailor custom prompts for each writing workflow.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="button primary" onClick={() => openCreate()}>
              <Plus size={17} /> Create prompt
            </button>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close prompts">
              <X size={20} />
            </button>
          </div>
        </section>
        {query.error ? <ErrorNotice error={query.error} /> : null}
        <div className="prompt-layout">
          <aside className="prompt-list" aria-label="Prompt library">
            <PromptListGroup
              title="Built-in prompts"
              ownership="builtin"
              prompts={builtinPrompts}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <PromptListGroup
              title="Your prompts"
              ownership="user"
              prompts={userPrompts}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </aside>
          <section className="prompt-editor">
            {!draft ? (
              <EmptyState
                title="Choose a prompt"
                body="Select a built-in or custom prompt to inspect its messages."
              />
            ) : (
              <>
                <div className="prompt-editor-heading">
                  <div className="prompt-editor-title">
                    <p className="eyebrow">
                      {draft.ownership === "builtin" ? (
                        <>
                          <LockKeyhole size={12} /> Built-in prompt
                        </>
                      ) : (
                        "Your prompt"
                      )}
                      {isActive ? (
                        <span className="active-prompt-badge">
                          <Check size={11} /> Active
                        </span>
                      ) : null}
                    </p>
                    <input
                      className="title-input"
                      disabled={draft.ownership === "builtin"}
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    />
                    <div className="prompt-workflow-readout">
                      <span>Workflow</span>
                      <strong>{workflowLabels[draft.workflow]}</strong>
                      <code>{draft.workflow}</code>
                    </div>
                  </div>
                  <div className="prompt-editor-actions">
                    <button
                      type="button"
                      className="button ghost"
                      disabled={isActive || bind.isPending}
                      onClick={() => bind.mutate({ workflow: draft.workflow, promptId: draft.id })}
                    >
                      {isActive ? "In use" : "Use for workflow"}
                    </button>
                    {draft.ownership === "builtin" ? (
                      <button
                        type="button"
                        className="button primary"
                        onClick={() => openCreate(draft)}
                      >
                        <FileInput size={15} /> Use as template
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="button ghost"
                          disabled={!binding?.promptDefinitionId || bind.isPending}
                          onClick={() => bind.mutate({ workflow: draft.workflow, promptId: null })}
                        >
                          Restore built-in
                        </button>
                        <button
                          type="button"
                          className="button danger"
                          disabled={remove.isPending}
                          onClick={async () => {
                            if (
                              !(await dialog.confirm({
                                title: "Delete prompt?",
                                body: `“${draft.name}” will be permanently deleted. Its workflow will fall back to the built-in prompt if it is currently active.`,
                                confirmLabel: "Delete prompt",
                                destructive: true,
                              }))
                            )
                              return;
                            remove.mutate(draft.id);
                          }}
                        >
                          <Trash2 size={15} /> Delete
                        </button>
                        <button
                          type="button"
                          className="button primary"
                          disabled={!draft.name.trim() || save.isPending}
                          onClick={() => save.mutate(draft)}
                        >
                          <Save size={15} /> {save.isPending ? "Saving…" : "Save"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <PromptFields
                  value={draft}
                  disabled={draft.ownership === "builtin"}
                  onChange={(next) => setDraft({ ...draft, ...next })}
                />
                {save.error || bind.error || remove.error ? (
                  <ErrorNotice error={save.error ?? bind.error ?? remove.error} />
                ) : null}
              </>
            )}
          </section>
        </div>

        {creating ? (
          <div className="modal-backdrop">
            <form
              className="modal prompt-create-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-prompt-title"
              onMouseDown={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                if (formValid) create.mutate(createDraft);
              }}
            >
              <div className="prompt-create-heading">
                <div>
                  <p className="eyebrow">Custom prompt</p>
                  <h2 id="create-prompt-title">Create prompt</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close create prompt dialog"
                  onClick={() => setCreating(false)}
                >
                  <X size={17} />
                </button>
              </div>

              <div className="prompt-create-source-grid">
                <label>
                  <span>Start from</span>
                  <select
                    value={createTemplateId}
                    onChange={(event) => {
                      const sourceId = event.target.value;
                      setCreateTemplateId(sourceId);
                      const source = builtinPrompts.find((prompt) => prompt.id === sourceId);
                      setCreateDraft(
                        source ? promptFromBuiltin(source) : blankPrompt(createDraft.workflow),
                      );
                    }}
                  >
                    <option value="blank">Blank prompt</option>
                    {builtinPrompts.map((prompt) => (
                      <option value={prompt.id} key={prompt.id}>
                        {workflowLabels[prompt.workflow]} — {prompt.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Workflow</span>
                  <select
                    value={createDraft.workflow}
                    onChange={(event) => {
                      const workflow = event.target.value as WorkflowKey;
                      setCreateTemplateId("blank");
                      setCreateDraft(blankPrompt(workflow));
                    }}
                  >
                    {workflowKeys.map((workflow) => (
                      <option value={workflow} key={workflow}>
                        {workflowLabels[workflow]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="prompt-create-name">
                  <span>Name</span>
                  <input
                    value={createDraft.name}
                    placeholder="My custom prompt"
                    onChange={(event) => setCreateDraft({ ...createDraft, name: event.target.value })}
                  />
                </label>
              </div>

              <PromptFields value={createDraft} onChange={setCreateDraft} />
              {create.error ? <ErrorNotice error={create.error} /> : null}
              <div className="modal-actions">
                <button type="button" className="button ghost" onClick={() => setCreating(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={!formValid || create.isPending}
                >
                  <Plus size={15} /> {create.isPending ? "Creating…" : "Create prompt"}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
