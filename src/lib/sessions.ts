import type { SupabaseClient } from "@supabase/supabase-js";
import { PRICING_VERSION, summarizeUsage, type RawUsage } from "./pricing";
import type { TranscriptItem } from "./validation";

export interface FinalizeOptions {
  status: "completed" | "error";
  endReason: string;
  transcript?: TranscriptItem[];
  /** For sessions nobody closed: end them at their last known activity, not "now". */
  abandoned?: boolean;
}

export type FinalizeResult =
  | { ok: true; alreadyFinished: boolean }
  | { ok: false; status: number; error: string };

/**
 * Closes a session: sums its stored usage messages, computes the cost ESTIMATE and duration on the
 * server (never trusting client-sent numbers), and marks it finished. Runs as the signed-in user, so RLS applies.
 */
export async function finalizeSession(
  supabase: SupabaseClient,
  sessionId: string,
  opts: FinalizeOptions,
): Promise<FinalizeResult> {
  const { data: session, error: sErr } = await supabase
    .from("voice_sessions")
    .select("id, status, started_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (sErr) return { ok: false, status: 500, error: "Could not load the session." };
  if (!session) return { ok: false, status: 404, error: "Session not found." };
  if (session.status !== "active") return { ok: true, alreadyFinished: true };

  const { data: events, error: eErr } = await supabase
    .from("session_usage_events")
    .select("usage, received_at")
    .eq("session_id", sessionId)
    .order("seq", { ascending: true });
  if (eErr) return { ok: false, status: 500, error: "Could not load usage data." };

  const totals = summarizeUsage((events ?? []).map((e) => e.usage as RawUsage));

  const started = new Date(session.started_at as string);
  let ended = new Date();
  if (opts.abandoned) {
    const last = events && events.length > 0 ? new Date(events[events.length - 1].received_at as string) : started;
    ended = last;
  }
  const durationSeconds = Math.max(0, Math.round((ended.getTime() - started.getTime()) / 1000));

  const { error: uErr } = await supabase
    .from("voice_sessions")
    .update({
      status: opts.status,
      ended_at: ended.toISOString(),
      duration_seconds: durationSeconds,
      end_reason: opts.endReason.slice(0, 200),
      usage_message_count: totals.messageCount,
      prompt_tokens: totals.promptTokens,
      response_tokens: totals.responseTokens,
      thoughts_tokens: totals.thoughtsTokens,
      input_text_tokens: totals.inputTextTokens,
      input_audio_tokens: totals.inputAudioTokens,
      output_text_tokens: totals.outputTextTokens,
      output_audio_tokens: totals.outputAudioTokens,
      estimated_cost_usd: totals.estimatedCostUsd,
      pricing_version: PRICING_VERSION,
      ...(opts.transcript ? { transcript: opts.transcript } : {}),
    })
    .eq("id", sessionId)
    .eq("status", "active");
  if (uErr) return { ok: false, status: 500, error: "Could not save the session." };
  return { ok: true, alreadyFinished: false };
}
