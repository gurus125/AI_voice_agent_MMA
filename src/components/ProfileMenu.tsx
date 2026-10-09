"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cleanProfileText, MAX_ABOUT_LENGTH, MAX_NAME_LENGTH } from "@/lib/profile";

type SaveState = "idle" | "saving" | "saved" | "failed";

/** Round profile button in the page header. Click it to edit name and details, or sign out. */
export function ProfileMenu({
  userId,
  email,
  initialName,
  initialAbout,
}: {
  userId: string;
  email: string | null;
  initialName: string;
  initialAbout: string;
}) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [about, setAbout] = useState(initialAbout);
  const [state, setState] = useState<SaveState>("idle");
  const [signingOut, setSigningOut] = useState(false);

  // Keep the form in step with what the server saved (after a refresh).
  useEffect(() => setName(initialName), [initialName]);
  useEffect(() => setAbout(initialAbout), [initialAbout]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shownName = initialName || (email ? email.split("@")[0] : "");
  const initial = (initialName || email || "?").trim().charAt(0).toUpperCase();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    const { error } = await createClient()
      .from("profiles")
      .upsert({
        user_id: userId,
        display_name: cleanProfileText(name, MAX_NAME_LENGTH),
        about: cleanProfileText(about, MAX_ABOUT_LENGTH),
        updated_at: new Date().toISOString(),
      });
    if (error) {
      setState("failed");
      return;
    }
    setState("saved");
    router.refresh(); // updates the greeting with the new name
  }

  async function signOut() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open profile"
        className="flex items-center gap-2 rounded-full border border-line bg-navy-800 py-1 pl-1 pr-3 hover:border-accent-dim"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-navy-950">
          {initial}
        </span>
        <span className="hidden max-w-[140px] truncate text-sm text-white sm:inline">
          {shownName || "Set up profile"}
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Your profile"
          className="absolute right-0 z-50 mt-2 w-[min(92vw,22rem)] rounded-xl border border-line bg-navy-800 p-4 shadow-xl shadow-black/40"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-semibold text-navy-950">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{shownName || "Your profile"}</p>
              {email ? <p className="truncate text-xs text-muted">{email}</p> : null}
            </div>
          </div>

          <form onSubmit={save} className="mt-4 space-y-3">
            <label className="block text-xs font-medium uppercase tracking-wide text-muted">
              Your name
              <input
                value={name}
                maxLength={MAX_NAME_LENGTH}
                onChange={(e) => {
                  setName(e.target.value);
                  setState("idle");
                }}
                placeholder="e.g. Gurpreet"
                className="mt-1.5 w-full rounded-lg border border-line bg-navy-900 p-2.5 text-sm normal-case tracking-normal text-white outline-none focus:border-accent"
              />
            </label>
            <label className="block text-xs font-medium uppercase tracking-wide text-muted">
              A few details about you
              <textarea
                value={about}
                maxLength={MAX_ABOUT_LENGTH}
                onChange={(e) => {
                  setAbout(e.target.value);
                  setState("idle");
                }}
                rows={3}
                placeholder="e.g. Software engineer in Mumbai. I like short answers."
                className="mt-1.5 w-full resize-y rounded-lg border border-line bg-navy-900 p-2.5 text-sm normal-case tracking-normal text-white outline-none focus:border-accent"
              />
              <span className="block text-right normal-case tracking-normal">
                {about.length}/{MAX_ABOUT_LENGTH}
              </span>
            </label>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={state === "saving"}
                className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-navy-950 disabled:opacity-50"
              >
                {state === "saving" ? "Saving..." : "Save"}
              </button>
              <span role="status" className="text-xs text-muted">
                {state === "saved" ? "Saved. New conversations will use it." : null}
                {state === "failed" ? "Could not save. Try again." : null}
              </span>
            </div>
          </form>

          <div className="mt-4 border-t border-line pt-3">
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="text-sm text-muted hover:text-white disabled:opacity-50"
            >
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
