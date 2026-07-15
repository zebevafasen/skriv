import { useNavigate } from "@tanstack/react-router";
import { LogIn, Sparkles, UserPlus } from "lucide-react";
import { useState } from "react";

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        mode === "sign-in" ? "/api/auth/sign-in/email" : "/api/auth/sign-up/email",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(mode === "sign-up" ? { "x-skriv-invite-token": inviteToken } : {}),
          },
          body: JSON.stringify(mode === "sign-in" ? { email, password } : { name, email, password }),
        },
      );
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.message ?? payload?.message ?? "Authentication failed.");
      await navigate({ to: "/" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-emblem"><Sparkles size={24} /></div>
        <p className="eyebrow">Private beta</p>
        <h1>{mode === "sign-in" ? "Return to your stories" : "Accept your invitation"}</h1>
        <p className="auth-intro">Your manuscripts and story knowledge remain private to your workspace.</p>
        {mode === "sign-up" ? <label>Name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label> : null}
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} /></label>
        {mode === "sign-up" ? <label>Invitation token<input value={inviteToken} onChange={(event) => setInviteToken(event.target.value)} autoComplete="off" /></label> : null}
        {error ? <p className="error-notice">{error}</p> : null}
        <button type="button" className="button primary full" disabled={pending || !email || !password || (mode === "sign-up" && (!name || !inviteToken))} onClick={() => void submit()}>
          {mode === "sign-in" ? <LogIn size={16} /> : <UserPlus size={16} />}
          {pending ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
        <button type="button" className="auth-switch" onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}>
          {mode === "sign-in" ? "Have an invitation? Create an account" : "Already registered? Sign in"}
        </button>
      </section>
    </div>
  );
}
