"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthButton({ email }: { email: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {email ? <span className="max-w-[180px] truncate text-xs text-muted">{email}</span> : null}
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-white disabled:opacity-50"
      >
        Sign out
      </button>
    </div>
  );
}
