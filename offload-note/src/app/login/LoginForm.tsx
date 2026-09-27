"use client";
import { useState } from "react";
import { apiUrl } from "@/components/client";

export default function LoginForm() {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pin }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not log in.");
      window.location.href = "/note";
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "No signal. Try again when you have signal.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" type="text" autoComplete="username" autoCapitalize="words" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="pin">PIN</label>
        <input
          id="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="current-password"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          required
        />
        <div className="hint">4 to 6 digits. You stay logged in on this phone for 30 days.</div>
      </div>
      {error ? <p className="err" role="alert">{error}</p> : null}
      <button className="btn block big" disabled={busy || !name || pin.length < 4}>
        {busy ? "Checking" : "Log in"}
      </button>
    </form>
  );
}
