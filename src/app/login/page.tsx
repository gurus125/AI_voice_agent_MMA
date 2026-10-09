"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const supabase = createClient();
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setInfo("Account created. Check your email to confirm it, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-xl font-semibold text-white">Voice Agent Dashboard</h1>
      <p className="mt-1 text-sm text-muted">
        {mode === "signin" ? "Sign in to continue" : "Create an account"}
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-line bg-navy-800 p-5">
        <label className="block text-xs font-medium uppercase tracking-wide text-muted">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-lg border border-line bg-navy-900 p-3 text-sm normal-case tracking-normal text-white outline-none focus:border-accent"
          />
        </label>
        <label className="block text-xs font-medium uppercase tracking-wide text-muted">
          Password
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-lg border border-line bg-navy-900 p-3 text-sm normal-case tracking-normal text-white outline-none focus:border-accent"
          />
        </label>

        {error ? (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
            {error}
          </p>
        ) : null}
        {info ? (
          <p role="status" className="rounded-lg border border-line bg-navy-900 p-3 text-xs text-muted">
            {info}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-navy-950 hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
          setInfo(null);
        }}
        className="mt-4 text-center text-xs text-muted hover:text-white"
      >
        {mode === "signin" ? "No account? Create one" : "Already have an account? Sign in"}
      </button>
    </main>
  );
}
