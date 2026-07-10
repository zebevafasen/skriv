import type { PromptDefinition, WorkflowKey } from "@asterism/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, LockKeyhole, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { EmptyState, ErrorNotice } from "../components/AppShell.js";

type PromptPayload = {
  prompts: PromptDefinition[];
  bindings: Array<{
    workflow: WorkflowKey;
    promptDefinitionId: string | null;
    builtinPromptId: string | null;
  }>;
};

export function PromptsPage() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["prompts"],
    queryFn: () => api<PromptPayload>("/api/prompts"),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = query.data?.prompts.find((prompt) => prompt.id === selectedId) ?? null;
  const [draft, setDraft] = useState<PromptDefinition | null>(selected);
  useEffect(() => setDraft(selected), [selected]);
  useEffect(() => {
    if (!selectedId && query.data?.prompts[0]) setSelectedId(query.data.prompts[0].id);
  }, [query.data, selectedId]);
  const copy = useMutation({
    mutationFn: (id: string) =>
      api<PromptDefinition>(`/api/prompts/${id}/copy`, { method: "POST" }),
    onSuccess: async (prompt) => {
      await client.invalidateQueries({ queryKey: ["prompts"] });
      setSelectedId(prompt.id);
    },
  });
  const save = useMutation({
    mutationFn: (prompt: PromptDefinition) =>
      api<PromptDefinition>(`/api/prompts/${prompt.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: prompt.name,
          description: prompt.description,
          messages: prompt.messages,
          variables: prompt.variables,
        }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["prompts"] }),
  });
  const create = useMutation({
    mutationFn: () =>
      api<PromptDefinition>("/api/prompts", {
        method: "POST",
        body: JSON.stringify({
          name: "Untitled Continue Prompt",
          workflow: "prose.continue",
          description: "A custom prose continuation prompt.",
          messages: [
            {
              role: "user",
              content:
                "{{context_package}}\n\nContinue after:\n{{manuscript_before_cursor}}\n\nAvoid conflicting with:\n{{manuscript_after_cursor}}\n\n{{user_instructions}}\n\nLength: {{target_length}}",
            },
          ],
          variables: [
            "context_package",
            "manuscript_before_cursor",
            "manuscript_after_cursor",
            "user_instructions",
            "target_length",
          ],
          sourcePromptId: null,
        }),
      }),
    onSuccess: async (prompt) => {
      await client.invalidateQueries({ queryKey: ["prompts"] });
      setSelectedId(prompt.id);
    },
  });
  const bind = useMutation({
    mutationFn: (prompt: PromptDefinition | null) =>
      api("/api/prompt-bindings", {
        method: "PUT",
        body: JSON.stringify({
          workflow: prompt?.workflow ?? draft?.workflow,
          promptId: prompt?.id ?? null,
        }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["prompts"] }),
  });
  const grouped = useMemo(() => query.data?.prompts ?? [], [query.data]);

  return (
    <div className="page prompts-page">
      <section className="page-heading">
        <p className="eyebrow">Prompt registry</p>
        <h1>Prompts</h1>
        <button type="button" className="button primary" onClick={() => create.mutate()}>
          Create prompt
        </button>
        <p>
          Inspect Asterism’s defaults and create editable copies for your own writing workflows.
        </p>
      </section>
      {query.error ? <ErrorNotice error={query.error} /> : null}
      <div className="prompt-layout">
        <aside className="prompt-list">
          {grouped.map((prompt) => (
            <button
              type="button"
              key={prompt.id}
              className={prompt.id === selectedId ? "active" : ""}
              onClick={() => setSelectedId(prompt.id)}
            >
              <span>{prompt.name}</span>
              <small>{prompt.workflow}</small>
            </button>
          ))}
        </aside>
        <section className="prompt-editor">
          {!draft ? (
            <EmptyState
              title="Choose a prompt"
              body="Select a workflow prompt to inspect its messages."
            />
          ) : (
            <>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">
                    {draft.ownership === "builtin" ? (
                      <>
                        <LockKeyhole size={12} /> Built-in, read-only
                      </>
                    ) : (
                      "Your prompt"
                    )}
                  </p>
                  <input
                    className="title-input"
                    disabled={draft.ownership === "builtin"}
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </div>
                <div className="button-row">
                  <button type="button" className="button ghost" onClick={() => bind.mutate(draft)}>
                    Use for workflow
                  </button>
                  <button type="button" className="button ghost" onClick={() => bind.mutate(null)}>
                    Restore default
                  </button>
                  {draft.ownership === "builtin" ? (
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => copy.mutate(draft.id)}
                    >
                      <Copy size={15} /> Make editable copy
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => save.mutate(draft)}
                    >
                      <Save size={15} /> Save
                    </button>
                  )}
                </div>
              </div>
              <label>
                Description
                <textarea
                  disabled={draft.ownership === "builtin"}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </label>
              <div className="message-stack">
                {draft.messages.map((message, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: Prompt messages do not have persistent IDs in the public schema.
                  <label key={`${message.role}-${index}`}>
                    <span>{message.role}</span>
                    <textarea
                      disabled={draft.ownership === "builtin"}
                      value={message.content}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          messages: draft.messages.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, content: event.target.value } : item,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="variable-list">
                <strong>Available variables</strong>
                {draft.variables.map((variable) => (
                  <code key={variable}>{`{{${variable}}}`}</code>
                ))}
              </div>
              {save.error || copy.error || bind.error ? (
                <ErrorNotice error={save.error ?? copy.error ?? bind.error} />
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
