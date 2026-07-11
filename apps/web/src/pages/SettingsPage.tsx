import type { AiSettings, OpenRouterCredentialStatus } from "@asterism/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { ErrorNotice } from "../components/AppShell.js";
import { useAppDialog } from "../components/DialogProvider.js";
import { ModelSelect } from "../components/ModelSelect.js";

type Model = { id: string; name: string; contextLength: number };
type Invite = { id: string; email: string; expiresAt: string; acceptedAt: string | null };

export function SettingsPage() {
  const client = useQueryClient();
  const dialog = useAppDialog();
  const settings = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => api<AiSettings>("/api/settings/ai"),
  });
  const models = useQuery({ queryKey: ["models"], queryFn: () => api<Model[]>("/api/models") });
  const credential = useQuery({
    queryKey: ["openrouter-credential"],
    queryFn: () => api<OpenRouterCredentialStatus>("/api/settings/openrouter"),
  });
  const invites = useQuery({ queryKey: ["invites"], queryFn: () => api<Invite[]>("/api/invites") });
  const [draft, setDraft] = useState<AiSettings | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [openRouterKey, setOpenRouterKey] = useState("");
  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);
  const save = useMutation({
    mutationFn: (value: AiSettings) =>
      api<AiSettings>("/api/settings/ai", { method: "PATCH", body: JSON.stringify(value) }),
    onSuccess: async (value) => {
      setDraft(value);
      await client.invalidateQueries({ queryKey: ["ai-settings"] });
    },
  });
  const createInvite = useMutation({
    mutationFn: (email: string) =>
      api<{ token: string }>("/api/invites", {
        method: "POST",
        body: JSON.stringify({ email, expiresInDays: 7 }),
      }),
    onSuccess: async ({ token }) => {
      setInviteToken(token);
      setInviteEmail("");
      await client.invalidateQueries({ queryKey: ["invites"] });
    },
  });
  const saveCredential = useMutation({
    mutationFn: (apiKey: string) =>
      api<OpenRouterCredentialStatus>("/api/settings/openrouter", {
        method: "PUT",
        body: JSON.stringify({ apiKey }),
      }),
    onSuccess: async () => {
      setOpenRouterKey("");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["openrouter-credential"] }),
        client.invalidateQueries({ queryKey: ["models"] }),
      ]);
    },
  });
  const removeCredential = useMutation({
    mutationFn: () => api("/api/settings/openrouter", { method: "DELETE" }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["openrouter-credential"] }),
        client.invalidateQueries({ queryKey: ["models"] }),
      ]);
    },
  });
  return (
    <div className="page settings-page">
      <section className="page-heading">
        <p className="eyebrow">Configuration</p>
        <h1>AI settings</h1>
        <p>Choose separate models for creative writing and grounded context selection.</p>
      </section>
      {settings.error || models.error ? (
        <ErrorNotice error={settings.error ?? models.error} />
      ) : null}
      {draft ? (
        <section className="settings-card">
          <div className="settings-note">
            <ShieldCheck size={20} />
            <div>
              <strong>Credentials stay on the server</strong>
              <p>The browser receives model information, never your OpenRouter key.</p>
            </div>
          </div>
          <div className="credential-field">
            <div>
              <label htmlFor="openrouter-key">OpenRouter API key</label>
              <p>
                {credential.data?.configured
                  ? `Configured from ${credential.data.source} ·••••${credential.data.lastFour ?? ""}`
                  : "No key configured. Fake AI remains available for local testing."}
              </p>
            </div>
            <div className="credential-input-row">
              <KeyRound size={17} />
              <input
                id="openrouter-key"
                type="password"
                autoComplete="off"
                value={openRouterKey}
                onChange={(event) => setOpenRouterKey(event.target.value)}
                placeholder={credential.data?.configured ? "Enter a replacement key" : "sk-or-v1-…"}
              />
              <button
                type="button"
                className="button primary"
                disabled={openRouterKey.trim().length < 10 || saveCredential.isPending}
                onClick={() => saveCredential.mutate(openRouterKey.trim())}
              >
                {saveCredential.isPending ? "Validating…" : "Save key"}
              </button>
              {credential.data?.source === "user" ? (
                <button
                  type="button"
                  className="button danger"
                  aria-label="Remove personal OpenRouter key"
                  onClick={async () => {
                    if (
                      await dialog.confirm({
                        title: "Remove saved OpenRouter key?",
                        body: "Asterism will fall back to the server credential or fake provider configuration.",
                        confirmLabel: "Remove key",
                        destructive: true,
                      })
                    )
                      removeCredential.mutate();
                  }}
                >
                  <Trash2 size={15} />
                </button>
              ) : null}
            </div>
            {saveCredential.error || removeCredential.error ? (
              <ErrorNotice error={saveCredential.error ?? removeCredential.error} />
            ) : null}
          </div>
          <div className="form-field">
            <span>Base writing model</span>
            <ModelSelect
              value={draft.baseModel}
              onChange={(value) => {
                setDraft({ ...draft, baseModel: value });
                localStorage.setItem("asterism-latest-model", value);
              }}
              models={models.data ?? []}
            />
          </div>
          <div className="form-field">
            <span>Smart Context model</span>
            <ModelSelect
              value={draft.contextModel}
              onChange={(value) => {
                setDraft({ ...draft, contextModel: value });
                localStorage.setItem("asterism-latest-model", value);
              }}
              models={models.data ?? []}
            />
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.smartContextEnabled}
              onChange={(event) =>
                setDraft({ ...draft, smartContextEnabled: event.target.checked })
              }
            />{" "}
            Enable grounded Smart Context extraction
          </label>
          <label>
            Recursive discovery depth
            <input
              type="number"
              min={0}
              max={5}
              value={draft.recursionDepth}
              onChange={(event) =>
                setDraft({ ...draft, recursionDepth: Number(event.target.value) })
              }
            />
          </label>
          <button type="button" className="button primary" onClick={() => save.mutate(draft)}>
            <Save size={16} /> Save settings
          </button>
          {save.error ? <ErrorNotice error={save.error} /> : null}
        </section>
      ) : (
        <div className="loading">Loading settings…</div>
      )}
      <section className="settings-card invite-card">
        <div>
          <p className="eyebrow">Private beta</p>
          <h2>Invitations</h2>
          <p>Invitation tokens are shown once and expire after seven days.</p>
        </div>
        <div className="invite-form">
          <input
            type="email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="writer@example.com"
          />
          <button
            type="button"
            className="button primary"
            disabled={!inviteEmail || createInvite.isPending}
            onClick={() => createInvite.mutate(inviteEmail)}
          >
            Create invitation
          </button>
        </div>
        {inviteToken ? (
          <div className="invite-token">
            <strong>Copy this token now</strong>
            <code>{inviteToken}</code>
          </div>
        ) : null}
        <div className="invite-list">
          {invites.data?.map((invite) => (
            <div key={invite.id}>
              <span>{invite.email}</span>
              <small>
                {invite.acceptedAt
                  ? "Accepted"
                  : `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
              </small>
            </div>
          ))}
        </div>
        {createInvite.error ? <ErrorNotice error={createInvite.error} /> : null}
      </section>
    </div>
  );
}
