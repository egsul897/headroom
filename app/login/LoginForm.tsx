"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

/**
 * Sign-in form. Accounts are provisioned by Egzon's team — there is no
 * self-serve signup link here, by design. A successful sign-in lands on
 * "/" which redirects to the signed-in user's own company dashboard.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false, callbackUrl: "/" });
    setBusy(false);
    if (!res || res.error) {
      setError("Incorrect email or password.");
      return;
    }
    window.location.href = res.url ?? "/";
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      <label>
        <div className="row-label">Email</div>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label>
        <div className="row-label">Password</div>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </label>
      {error && <div role="alert">{error}</div>}
      <button className="button button-primary" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
