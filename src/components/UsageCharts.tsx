"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { UsagePoint } from "@/lib/types";
import { EmptyState } from "./EmptyState";

type Range = "daily" | "weekly";

function ChartCard({
  title,
  data,
  dataKey,
  format,
}: {
  title: string;
  data: UsagePoint[];
  dataKey: "costUsd" | "sessions" | "cumulativeCostUsd";
  format: (n: number) => string;
}) {
  return (
    <div className="rounded-xl border border-line bg-navy-800 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">{title}</h3>
      {data.length === 0 ? (
        <EmptyState
          title="No usage yet"
          body="Charts appear here once voice sessions have been recorded."
        />
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid stroke="#1e2d52" vertical={false} />
              <XAxis dataKey="label" stroke="#8ba0c4" fontSize={11} tickLine={false} />
              <YAxis
                stroke="#8ba0c4"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => format(v)}
              />
              <Tooltip
                cursor={{ fill: "rgb(34 211 238 / 0.08)" }}
                contentStyle={{
                  background: "#0a1224",
                  border: "1px solid #1e2d52",
                  borderRadius: 8,
                  color: "#e6edf9",
                }}
                formatter={(v) => format(Number(v))}
              />
              <Bar dataKey={dataKey} fill="#22d3ee" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function UsageCharts({ daily, weekly }: { daily: UsagePoint[]; weekly: UsagePoint[] }) {
  const [range, setRange] = useState<Range>("daily");
  const data = range === "daily" ? daily : weekly;

  return (
    <section aria-label="Usage charts">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Usage over time</h2>
        <div className="inline-flex rounded-lg border border-line p-0.5 text-xs">
          {(["daily", "weekly"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1 capitalize transition-colors ${
                range === r ? "bg-accent text-navy-950" : "text-muted hover:text-white"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ChartCard
          title="Estimated cost (USD)"
          data={data}
          dataKey="costUsd"
          format={(n) => `$${n.toFixed(n < 1 ? 3 : 2)}`}
        />
        <ChartCard
          title="Running total cost (USD)"
          data={data}
          dataKey="cumulativeCostUsd"
          format={(n) => `$${n.toFixed(n < 1 ? 3 : 2)}`}
        />
        <ChartCard
          title="Sessions"
          data={data}
          dataKey="sessions"
          format={(n) => String(Math.round(n))}
        />
      </div>
    </section>
  );
}
