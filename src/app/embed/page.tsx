import { EmbedAgent } from "@/components/EmbedAgent";
import { DEFAULT_PERSONA, findPreset } from "@/lib/personas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Embeddable voice agent. Usage:
 *   <iframe src="https://YOUR_HOST/embed?preset=support" allow="microphone" style="border:0;width:380px;height:520px"></iframe>
 * `preset` is one of the ids in src/lib/personas.ts. Only presets are accepted (not free text) so a link can't inject a persona.
 */
export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const presetId = typeof sp.preset === "string" ? sp.preset : undefined;
  const preset = findPreset(presetId);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-sm text-white">Sign in to use the voice agent.</p>
        <a
          href="/login"
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-navy-950 hover:brightness-110"
        >
          Sign in (opens in a new tab)
        </a>
        <p className="text-xs text-muted">Then reload this widget.</p>
      </div>
    );
  }

  return <EmbedAgent persona={preset?.instructions ?? DEFAULT_PERSONA} title={preset?.label ?? "Voice agent"} />;
}
