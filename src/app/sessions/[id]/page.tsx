import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/LocalTime";
import { AutoRefresh } from "@/components/AutoRefresh";
import { formatDuration, formatNumber, formatUsd } from "@/lib/format";
import { costBreakdown, PRICING_VERSION, summarizeUsage, type RawUsage, type UsageTotals } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import { isUuid, sanitizeTranscript } from "@/lib/validation";

export const dynamic = "force-dynamic";

export default async function SessionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data: s } = await supabase.from("voice_sessions").select("*").eq("id", id).maybeSingle();
  if (!s) notFound(); // also covers other users' sessions: Row Level Security hides them

  const { data: events } = await supabase
    .from("session_usage_events")
    .select("seq, usage, received_at")
    .eq("session_id", id)
    .order("seq", { ascending: true });
  const usage = (events ?? []) as { seq: number; usage: RawUsage; received_at: string }[];

  const live = s.status === "active";
  const totals: UsageTotals = live
    ? summarizeUsage(usage.map((e) => e.usage))
    : {
        messageCount: Number(s.usage_message_count),
        promptTokens: Number(s.prompt_tokens),
        responseTokens: Number(s.response_tokens),
        thoughtsTokens: Number(s.thoughts_tokens),
        inputTextTokens: Number(s.input_text_tokens),
        inputAudioTokens: Number(s.input_audio_tokens),
        outputTextTokens: Number(s.output_text_tokens),
        outputAudioTokens: Number(s.output_audio_tokens),
        estimatedCostUsd: Number(s.estimated_cost_usd),
      };
  const lines = costBreakdown(totals);
  const transcript = sanitizeTranscript(s.transcript);
  const duration = live
    ? Math.round((Date.now() - new Date(s.started_at as string).getTime()) / 1000)
    : Number(s.duration_seconds ?? 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      {live ? <AutoRefresh intervalMs={5000} /> : null}
      <Link href="/" className="text-xs text-accent hover:underline">
        ← Back to dashboard
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-white">Session details</h1>
      <p className="mt-1 break-all text-xs text-muted">{s.id}</p>

      <dl className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Status", live ? "live" : (s.status as string)],
          ["Duration", formatDuration(duration)],
          ["Model", s.model as string],
          ["Est. cost", formatUsd(totals.estimatedCostUsd)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-navy-800 p-3">
            <dt className="text-xs uppercase tracking-wide text-muted">{k}</dt>
            <dd className="mt-1 text-sm font-semibold capitalize text-white">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted">
        Started <LocalTime iso={s.started_at as string} />
        {s.ended_at ? (
          <>
            {" "}
            · ended <LocalTime iso={s.ended_at as string} />
          </>
        ) : null}
        {s.end_reason ? ` · ${s.end_reason as string}` : ""}
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-white">Persona</h2>
        <p className="rounded-xl border border-line bg-navy-800 p-4 text-sm text-white">{(s.persona as string) ?? "—"}</p>
      </section>

      <section className="mt-8">
        <h2 className="mb-1 text-base font-semibold text-white">Estimated cost breakdown</h2>
        <p className="mb-3 text-xs text-muted">
          Estimate only ({PRICING_VERSION}), not a billing figure. Tokens come from the API&apos;s usage metadata.
        </p>
        <div className="overflow-x-auto rounded-xl border border-line bg-navy-800">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Tokens</th>
                <th className="px-4 py-3 font-medium">USD / 1M</th>
                <th className="px-4 py-3 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.label} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3">{l.label}</td>
                  <td className="px-4 py-3">{formatNumber(l.tokens)}</td>
                  <td className="px-4 py-3">${l.ratePerMillionUsd.toFixed(2)}</td>
                  <td className="px-4 py-3">{formatUsd(l.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-white">Usage messages from the API</h2>
        {usage.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-xs text-muted">
            No usage messages were received for this session.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-navy-800">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Received</th>
                  <th className="px-4 py-3 font-medium">Prompt</th>
                  <th className="px-4 py-3 font-medium">Response</th>
                  <th className="px-4 py-3 font-medium">Thoughts</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((e) => (
                  <tr key={e.seq} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3">{e.seq}</td>
                    <td className="px-4 py-3">
                      <LocalTime iso={e.received_at} />
                    </td>
                    <td className="px-4 py-3">{formatNumber(e.usage.promptTokenCount ?? null)}</td>
                    <td className="px-4 py-3">{formatNumber(e.usage.responseTokenCount ?? null)}</td>
                    <td className="px-4 py-3">{formatNumber(e.usage.thoughtsTokenCount ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-white">Transcript</h2>
        {transcript.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-xs text-muted">
            {live
              ? "The transcript is saved when the session ends."
              : "No transcript was captured for this session."}
          </p>
        ) : (
          <div className="space-y-2 rounded-xl border border-line bg-navy-800 p-4">
            {transcript.map((t, i) => (
              <div key={i} className="text-sm">
                <span className="mr-2 text-xs uppercase tracking-wide text-muted">
                  {t.role === "user" ? "You" : "Gemini"}
                  {t.at ? (
                    <>
                      {" · "}
                      <LocalTime iso={t.at} />
                    </>
                  ) : null}
                </span>
                <p className="mt-0.5 text-white">{t.text}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
