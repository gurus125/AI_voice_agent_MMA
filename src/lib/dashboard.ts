import { createClient } from "@/lib/supabase/server";
import { finalizeSession } from "@/lib/sessions";
import { summarizeUsage, type RawUsage } from "@/lib/pricing";
import type { DashboardData, SessionRow, SessionStatus, UsagePoint } from "./types";

/** An audio session without resumption lasts at most ~15 min, so an "active" row older than this was abandoned. */
const STALE_ACTIVE_MINUTES = 20;
const DAILY_DAYS = 14;
const WEEKLY_WEEKS = 8;

interface DbSession {
  id: string;
  status: SessionStatus;
  started_at: string;
  duration_seconds: number | null;
  prompt_tokens: number | string | null;
  response_tokens: number | string | null;
  thoughts_tokens: number | string | null;
  input_audio_tokens: number | string | null;
  output_audio_tokens: number | string | null;
  estimated_cost_usd: number | string | null;
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const label = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

function startOfWeekUtc(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

/**
 * All figures come from the signed-in user's own rows (RLS). Costs are estimates; see lib/pricing.ts.
 * Sessions still in progress are priced live from the usage messages stored so far.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();

  // Close out sessions that were never ended (tab crash, lost network) so they don't count as active forever.
  const cutoff = new Date(Date.now() - STALE_ACTIVE_MINUTES * 60 * 1000).toISOString();
  const { data: stale } = await supabase
    .from("voice_sessions")
    .select("id")
    .eq("status", "active")
    .lt("started_at", cutoff);
  for (const s of stale ?? []) {
    await finalizeSession(supabase, s.id as string, {
      status: "error",
      endReason: "abandoned (never ended)",
      abandoned: true,
    });
  }

  const { data, error } = await supabase
    .from("voice_sessions")
    .select(
      "id, status, started_at, duration_seconds, prompt_tokens, response_tokens, thoughts_tokens, input_audio_tokens, output_audio_tokens, estimated_cost_usd",
    )
    .order("started_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error("Could not load sessions.");
  const rows = (data ?? []) as DbSession[];

  // Live figures for in-progress sessions, computed from the usage messages stored so far.
  const activeIds = rows.filter((r) => r.status === "active").map((r) => r.id);
  const liveByStatusId = new Map<string, ReturnType<typeof summarizeUsage>>();
  if (activeIds.length > 0) {
    const { data: events } = await supabase
      .from("session_usage_events")
      .select("session_id, usage")
      .in("session_id", activeIds)
      .order("seq", { ascending: true });
    const grouped = new Map<string, RawUsage[]>();
    for (const e of events ?? []) {
      const list = grouped.get(e.session_id as string) ?? [];
      list.push(e.usage as RawUsage);
      grouped.set(e.session_id as string, list);
    }
    for (const id of activeIds) liveByStatusId.set(id, summarizeUsage(grouped.get(id) ?? []));
  }

  const now = Date.now();
  const sessionsAll: SessionRow[] = rows.map((r) => {
    const live = liveByStatusId.get(r.id);
    return {
      id: r.id,
      startedAt: r.started_at,
      status: r.status,
      durationSeconds:
        r.status === "active"
          ? Math.max(0, Math.round((now - new Date(r.started_at).getTime()) / 1000))
          : (r.duration_seconds ?? 0),
      inputTokens: live ? live.promptTokens : num(r.prompt_tokens),
      inputAudioTokens: live ? live.inputAudioTokens : num(r.input_audio_tokens),
      outputTokens: live ? live.responseTokens : num(r.response_tokens),
      outputAudioTokens: live ? live.outputAudioTokens : num(r.output_audio_tokens),
      thoughtsTokens: live ? live.thoughtsTokens : num(r.thoughts_tokens),
      estimatedCostUsd: live ? live.estimatedCostUsd : num(r.estimated_cost_usd),
    };
  });

  const completed = sessionsAll.filter((s) => s.status === "completed");
  const summary = {
    activeSessions: sessionsAll.filter((s) => s.status === "active").length,
    completedSessions: completed.length,
    avgDurationSeconds: completed.length
      ? completed.reduce((a, s) => a + s.durationSeconds, 0) / completed.length
      : null,
    inputTokens: sessionsAll.reduce((a, s) => a + s.inputTokens, 0),
    outputTokens: sessionsAll.reduce((a, s) => a + s.outputTokens, 0),
    thoughtsTokens: sessionsAll.reduce((a, s) => a + s.thoughtsTokens, 0),
    totalEstimatedCostUsd: round6(sessionsAll.reduce((a, s) => a + s.estimatedCostUsd, 0)),
  };

  let daily: UsagePoint[] = [];
  let weekly: UsagePoint[] = [];
  if (sessionsAll.length > 0) {
    const today = new Date();

    const dayBuckets = new Map<string, UsagePoint>();
    for (let i = DAILY_DAYS - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
      dayBuckets.set(dayKey(d), { label: label(d), costUsd: 0, cumulativeCostUsd: 0, sessions: 0 });
    }
    const weekBuckets = new Map<string, UsagePoint>();
    const thisWeek = startOfWeekUtc(today);
    for (let i = WEEKLY_WEEKS - 1; i >= 0; i--) {
      const d = new Date(thisWeek);
      d.setUTCDate(d.getUTCDate() - i * 7);
      weekBuckets.set(dayKey(d), { label: `Wk ${label(d)}`, costUsd: 0, cumulativeCostUsd: 0, sessions: 0 });
    }

    const firstDay = dayKey(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (DAILY_DAYS - 1))));
    const firstWeek = [...weekBuckets.keys()][0];
    let costBeforeDays = 0;
    let costBeforeWeeks = 0;
    for (const s of sessionsAll) {
      const started = new Date(s.startedAt);
      const dk = dayKey(started);
      const wk = dayKey(startOfWeekUtc(started));
      const d = dayBuckets.get(dk);
      if (d) {
        d.sessions += 1;
        d.costUsd += s.estimatedCostUsd;
      } else if (dk < firstDay) {
        costBeforeDays += s.estimatedCostUsd;
      }
      const w = weekBuckets.get(wk);
      if (w) {
        w.sessions += 1;
        w.costUsd += s.estimatedCostUsd;
      } else if (wk < firstWeek) {
        costBeforeWeeks += s.estimatedCostUsd;
      }
    }

    const finish = (buckets: Map<string, UsagePoint>, base: number): UsagePoint[] => {
      let running = base;
      return [...buckets.values()].map((p) => {
        running += p.costUsd;
        return { ...p, costUsd: round6(p.costUsd), cumulativeCostUsd: round6(running) };
      });
    };
    daily = finish(dayBuckets, costBeforeDays);
    weekly = finish(weekBuckets, costBeforeWeeks);
  }

  return { summary, daily, weekly, sessions: sessionsAll.slice(0, 15) };
}
