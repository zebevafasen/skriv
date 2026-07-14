import { SettingsPage } from "@asterism/ui/settings";
import { Copy, LogOut, Trash2, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

type Invite = { id: string; email: string; token?: string; expiresAt: string; acceptedAt?: string | null };

async function inviteRequest<T>(path = "/api/invites", init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (response.status === 401) window.location.assign("/login");
  if (!response.ok) throw new Error("Invitation request failed.");
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function Invitations() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const refresh = () => inviteRequest<Invite[]>().then(setInvites).catch((cause) => setError(String(cause)));
  useEffect(() => {
    void inviteRequest<Invite[]>().then(setInvites).catch((cause) => setError(String(cause)));
  }, []);
  return (
    <section className="settings-card">
      <div><p className="eyebrow">Hosted access</p><h2>Invitations and account</h2><p>Invite another private-beta user or end this browser session.</p></div>
      <div className="credential-input-row">
        <UserPlus size={17} />
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="writer@example.com" />
        <button type="button" className="button primary" disabled={!email} onClick={() => void inviteRequest<Invite>("/api/invites", { method: "POST", body: JSON.stringify({ email, expiresInDays: 7 }) }).then((created) => { setInvites((current) => [created, ...current]); setEmail(""); }).catch((cause) => setError(String(cause)))}>Create invitation</button>
      </div>
      <div className="snapshot-list">
        {invites.map((invite) => <div key={invite.id}><span>{invite.email}</span><small>{invite.acceptedAt ? "Accepted" : `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}</small>{invite.token ? <button type="button" className="button ghost" onClick={() => void navigator.clipboard.writeText(invite.token ?? "")}><Copy size={15} /> Copy token</button> : null}<button type="button" className="button danger" onClick={() => void inviteRequest(`/api/invites/${invite.id}`, { method: "DELETE" }).then(refresh)}><Trash2 size={15} /></button></div>)}
      </div>
      <button type="button" className="button ghost" onClick={() => void fetch("/api/auth/sign-out", { method: "POST", credentials: "include" }).finally(() => window.location.assign("/login"))}><LogOut size={16} /> Sign out</button>
      {error ? <p className="error-notice">{error}</p> : null}
    </section>
  );
}

export function WebSettingsPage() {
  return <SettingsPage extraSection={<Invitations />} />;
}
