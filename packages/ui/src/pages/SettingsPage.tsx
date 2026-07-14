import type { AiSettings } from "@asterism/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FolderOpen,
  HardDriveDownload,
  KeyRound,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { asterism } from "../api.js";
import { ErrorNotice } from "../components/AppShell.js";
import { useAppDialog } from "../components/DialogProvider.js";
import { ModelSelect } from "../components/ModelSelect.js";

type Model = { id: string; name: string; contextLength: number };
type DatabaseSnapshot = { name: string; createdAt: string; size: number };

export function SettingsPage() {
  const client = useQueryClient();
  const dialog = useAppDialog();
  const settings = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => asterism().settings.ai(),
  });
  const credential = useQuery({
    queryKey: ["openrouter-credential"],
    queryFn: () => asterism().settings.credential(),
  });
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => asterism().settings.models() as Promise<Model[]>,
    enabled: credential.data?.configured === true,
  });
  const snapshots = useQuery({
    queryKey: ["database-snapshots"],
    queryFn: () => asterism().settings.databaseSnapshots() as Promise<DatabaseSnapshot[]>,
  });
  const [draft, setDraft] = useState<AiSettings | null>(null);
  const [openRouterKey, setOpenRouterKey] = useState("");
  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (value: AiSettings) => asterism().settings.updateAi(value),
    onSuccess: async (value) => {
      setDraft(value);
      await client.invalidateQueries({ queryKey: ["ai-settings"] });
    },
  });
  const saveCredential = useMutation({
    mutationFn: (apiKey: string) => asterism().settings.saveCredential(apiKey),
    onSuccess: async () => {
      setOpenRouterKey("");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["openrouter-credential"] }),
        client.invalidateQueries({ queryKey: ["models"] }),
      ]);
    },
  });
  const removeCredential = useMutation({
    mutationFn: () => asterism().settings.deleteCredential(),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["openrouter-credential"] }),
        client.invalidateQueries({ queryKey: ["models"] }),
      ]);
    },
  });
  const backupNow = useMutation({
    mutationFn: () => asterism().settings.backupNow(),
  });
  const openBackupFolder = useMutation({
    mutationFn: () => asterism().settings.openBackupFolder(),
  });
  const restoreSnapshot = useMutation({
    mutationFn: (name: string) => asterism().settings.restoreDatabaseSnapshot(name),
  });

  return (
    <div className="page settings-page">
      <section className="page-heading">
        <p className="eyebrow">Configuration</p>
        <h1>Settings</h1>
        <p>Configure private AI access, writing models, and local recovery.</p>
      </section>
      {settings.error || models.error || credential.error ? (
        <ErrorNotice error={settings.error ?? models.error ?? credential.error} />
      ) : null}
      {draft ? (
        <section className="settings-card">
          <div className="settings-note">
            <ShieldCheck size={20} />
            <div>
              <strong>Your key stays in Windows Credential Manager</strong>
              <p>
                OpenRouter requests run in the native process. The UI never receives the saved key.
              </p>
            </div>
          </div>
          <div className="credential-field">
            <div>
              <label htmlFor="openrouter-key">OpenRouter API key</label>
              <p>
                {credential.data?.configured
                  ? `Configured in the keychain ·••••${credential.data.lastFour ?? ""}`
                  : "No key configured. All non-AI writing features remain available offline."}
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
              {credential.data?.source === "keychain" ? (
                <button
                  type="button"
                  className="button danger"
                  aria-label="Remove OpenRouter key"
                  onClick={async () => {
                    if (
                      await dialog.confirm({
                        title: "Remove saved OpenRouter key?",
                        body: "AI actions will be disabled until another key is configured.",
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
              onChange={(value) => setDraft({ ...draft, baseModel: value })}
              models={models.data ?? []}
            />
          </div>
          <div className="form-field">
            <span>Smart Context model</span>
            <ModelSelect
              value={draft.contextModel}
              onChange={(value) => setDraft({ ...draft, contextModel: value })}
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

      <section className="settings-card">
        <div>
          <p className="eyebrow">Local recovery</p>
          <h2>Backups</h2>
          <p>Portable project snapshots and internal database safety copies are stored locally.</p>
        </div>
        <div className="button-row">
          <button type="button" className="button primary" onClick={() => backupNow.mutate()}>
            <HardDriveDownload size={16} /> Back up now
          </button>
          <button type="button" className="button ghost" onClick={() => openBackupFolder.mutate()}>
            <FolderOpen size={16} /> Open backup folder
          </button>
        </div>
        <div className="snapshot-list">
          {snapshots.data?.map((snapshot) => (
            <div key={snapshot.name}>
              <span>{new Date(snapshot.createdAt).toLocaleString()}</span>
              <small>{(snapshot.size / 1024 / 1024).toFixed(1)} MiB</small>
              <button
                type="button"
                className="button danger"
                onClick={async () => {
                  if (
                    await dialog.confirm({
                      title: "Restore this database snapshot?",
                      body: "Asterism will replace the current database and restart. A safety copy is made first.",
                      confirmLabel: "Restore and restart",
                      destructive: true,
                    })
                  )
                    restoreSnapshot.mutate(snapshot.name);
                }}
              >
                <RotateCcw size={15} /> Restore
              </button>
            </div>
          ))}
        </div>
        {backupNow.error || openBackupFolder.error || restoreSnapshot.error || snapshots.error ? (
          <ErrorNotice
            error={
              backupNow.error ?? openBackupFolder.error ?? restoreSnapshot.error ?? snapshots.error
            }
          />
        ) : null}
      </section>
    </div>
  );
}
