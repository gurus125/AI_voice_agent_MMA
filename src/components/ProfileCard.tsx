"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cleanProfileText, MAX_ABOUT_LENGTH, MAX_NAME_LENGTH } from "@/lib/profile";

type SaveState = "idle" | "saving" | "saved" | "failed";

export function ProfileCard({
  userId,
  initialName,
  initialAbout,
}: {
  userId: string;
  initialName: string;
  initialAbout: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [about, setAbout] = useState(initialAbout);
  const [state, setState] = useState<SaveState>("idle");

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
    router.refresh(); // reloads the greeting with the new name
  }

  return (
    <details
      className="rounded-xl border border-line bg-navy-800 p-4"
      open={!initialName && !initialAbout}
    >
      <summary className="cursor-pointer text-sm font-medium text-white">
        Your profile <span className="font-normal text-muted">- helps the voice agent know who you are</span>
      </summary>
      <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2">
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
            className="mt-2 w-full rounded-lg border border-line bg-navy-900 p-3 text-sm normal-case tracking-normal text-white outline-none focus:border-accent"
          />
        </label>
        <label className="block text-xs font-medium uppercase tracking-wide text-muted sm:row-span-2">
          A few details about you
          <textarea
            value={about}
            maxLength={MAX_ABOUT_LENGTH}
            onChange={(e) => {
              setAbout(e.target.value);
              setState("idle");
            }}
            rows={4}
            placeholder="e.g. Software engineer in Mumbai. I like short answers."
            className="mt-2 w-full resize-y rounded-lg border border-line bg-navy-900 p-3 text-sm normal-case tracking-normal text-white outline-none focus:border-accent"
          />
          <span className="mt-1 block text-right normal-case tracking-normal">
            {about.length}/{MAX_ABOUT_LENGTH}
          </span>
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={state === "saving"}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-navy-950 disabled:opacity-50"
          >
            {state === "saving" ? "Saving..." : "Save profile"}
          </button>
          <span role="status" className="text-xs text-muted">
            {state === "saved" ? "Saved. New conversations will use it." : null}
            {state === "failed" ? "Could not save. Try again." : null}
          </span>
        </div>
      </form>
    </details>
  );
}
