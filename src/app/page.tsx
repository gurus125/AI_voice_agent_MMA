import { getDashboardData } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { formatDuration, formatNumber, formatUsd } from "@/lib/format";
import type { DashboardData } from "@/lib/types";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Greeting } from "@/components/Greeting";
import { ProfileMenu } from "@/components/ProfileMenu";
import { CostDisclaimer } from "@/components/CostDisclaimer";
import { MetricCard } from "@/components/MetricCard";
import { SessionsTable } from "@/components/SessionsTable";
import { UsageCharts } from "@/components/UsageCharts";
import { VoiceAgentPanel } from "@/components/VoiceAgentPanel";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("display_name, about").eq("user_id", user.id).maybeSingle()
    : { data: null };
  const displayName = profile?.display_name ?? "";

  let data: DashboardData | null = null;
  let loadError: string | null = null;
  try {
    data = await getDashboardData();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load dashboard data.";
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white sm:text-2xl">Voice Agent Dashboard</h1>
          <p className="text-sm text-muted">Sessions, usage and estimated API cost</p>
        </div>
        {user ? (
          <ProfileMenu
            userId={user.id}
            email={user.email ?? null}
            initialName={displayName}
            initialAbout={profile?.about ?? ""}
          />
        ) : null}
      </header>

      <main className="space-y-8">
        <Greeting name={displayName} />

        <VoiceAgentPanel />

        {loadError || !data ? (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            {loadError ?? "Could not load dashboard data."} Refresh the page to try again.
          </p>
        ) : (
          <>
            <section aria-label="Summary metrics">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                <MetricCard label="Active sessions" value={formatNumber(data.summary.activeSessions)} />
                <MetricCard label="Completed" value={formatNumber(data.summary.completedSessions)} />
                <MetricCard label="Avg duration" value={formatDuration(data.summary.avgDurationSeconds)} />
                <MetricCard label="Input tokens" value={formatNumber(data.summary.inputTokens)} hint="Context re-sent each turn" />
                <MetricCard
                  label="Output tokens"
                  value={formatNumber(data.summary.outputTokens)}
                  hint={`+ ${formatNumber(data.summary.thoughtsTokens)} thinking`}
                />
                <MetricCard
                  label="Total est. cost"
                  value={formatUsd(data.summary.totalEstimatedCostUsd)}
                  hint="Estimate, not billing"
                />
              </div>
            </section>

            <AutoRefresh intervalMs={data.summary.activeSessions > 0 ? 5000 : 30000} />
            <UsageCharts daily={data.daily} weekly={data.weekly} />
            <SessionsTable sessions={data.sessions} />
            <CostDisclaimer />
          </>
        )}
      </main>
    </div>
  );
}
