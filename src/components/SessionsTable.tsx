import Link from "next/link";
import type { SessionRow } from "@/lib/types";
import { formatDuration, formatNumber, formatUsd } from "@/lib/format";
import { EmptyState } from "./EmptyState";
import { LocalTime } from "./LocalTime";

const statusStyle: Record<SessionRow["status"], string> = {
  active: "bg-accent/15 text-accent",
  completed: "bg-ok/15 text-ok",
  error: "bg-danger/15 text-danger",
};

export function SessionsTable({ sessions }: { sessions: SessionRow[] }) {
  return (
    <section aria-label="Recent sessions">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-white">Recent sessions</h2>
        <div className="flex gap-2 text-xs">
          <a
            href="/api/export?format=csv"
            className="rounded-full border border-line px-3 py-1 text-muted hover:text-white"
          >
            Export CSV
          </a>
          <a
            href="/api/export?format=json&transcript=1"
            className="rounded-full border border-line px-3 py-1 text-muted hover:text-white"
          >
            Export JSON
          </a>
        </div>
      </div>
      {sessions.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          body="Start a voice conversation above and it will be listed here."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-navy-800">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Input tokens (audio)</th>
                <th className="px-4 py-3 font-medium">Output tokens (audio)</th>
                <th className="px-4 py-3 font-medium">Thinking</th>
                <th className="px-4 py-3 font-medium">Est. cost</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3">
                    <LocalTime iso={s.startedAt} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusStyle[s.status]}`}>
                      {s.status === "active" ? "live" : s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{formatDuration(s.durationSeconds)}</td>
                  <td className="px-4 py-3">
                    {formatNumber(s.inputTokens)}{" "}
                    <span className="text-xs text-muted">({formatNumber(s.inputAudioTokens)})</span>
                  </td>
                  <td className="px-4 py-3">
                    {formatNumber(s.outputTokens)}{" "}
                    <span className="text-xs text-muted">({formatNumber(s.outputAudioTokens)})</span>
                  </td>
                  <td className="px-4 py-3">{formatNumber(s.thoughtsTokens)}</td>
                  <td className="px-4 py-3">{formatUsd(s.estimatedCostUsd)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/sessions/${s.id}`} className="text-xs text-accent hover:underline">
                      Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
