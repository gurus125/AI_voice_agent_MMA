"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGeminiLive, type LiveStatus } from "@/hooks/useGeminiLive";
import { formatDuration, formatNumber } from "@/lib/format";
import { MAX_PERSONA_LENGTH } from "@/lib/liveConfig";
import { DEFAULT_PERSONA, PERSONA_PRESETS } from "@/lib/personas";
import { EmptyState } from "./EmptyState";

const statusLabel: Record<LiveStatus, { text: string; dot: string }> = {
  idle: { text: "Not connected", dot: "bg-muted" },
  "requesting-mic": { text: "Waiting for microphone…", dot: "bg-yellow-400" },
  connecting: { text: "Connecting…", dot: "bg-yellow-400" },
  connected: { text: "Live", dot: "bg-ok" },
  ending: { text: "Ending…", dot: "bg-yellow-400" },
  error: { text: "Connection error", dot: "bg-danger" },
};

export function VoiceAgentPanel() {
  const router = useRouter();
  const { status, error, notice, transcript, usage, elapsedSeconds, saveState, start, end } = useGeminiLive({
    onSaved: () => router.refresh(),
  });
  const [persona, setPersona] = useState(DEFAULT_PERSONA);
  const [presetId, setPresetId] = useState("assistant");
  const endRef = useRef<HTMLDivElement>(null);

  const active = status === "connected" || status === "connecting" || status === "requesting-mic";
  const s = statusLabel[status];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [transcript]);

  return (
    <section
      aria-label="Voice agent"
      className="rounded-xl border border-accent-dim/60 bg-navy-800 p-5 shadow-[0_0_0_1px_rgb(34_211_238/0.08)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Voice agent</h2>
          <p className="mt-0.5 text-xs text-muted">Talk to MMA AI in real time. Headphones avoid echo.</p>
        </div>
        <div className="flex items-center gap-3">
          {status === "connected" ? (
            <span className="text-xs tabular-nums text-muted">{formatDuration(elapsedSeconds)}</span>
          ) : null}
          <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs">
            <span className={`h-2 w-2 rounded-full ${s.dot}`} />
            {s.text}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-4">
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            Use case
            <select
              value={presetId}
              disabled={active}
              onChange={(e) => {
                const id = e.target.value;
                setPresetId(id);
                const preset = PERSONA_PRESETS.find((x) => x.id === id);
                if (preset) setPersona(preset.instructions);
              }}
              className="mt-2 w-full rounded-lg border border-line bg-navy-900 p-3 text-sm normal-case tracking-normal text-white outline-none focus:border-accent disabled:opacity-60"
            >
              {PERSONA_PRESETS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="block text-xs font-medium uppercase tracking-wide text-muted">
            System instructions / persona
            <textarea
              value={persona}
              onChange={(e) => {
                setPersona(e.target.value);
                setPresetId("custom");
              }}
              maxLength={MAX_PERSONA_LENGTH}
              disabled={active}
              rows={5}
              className="mt-2 w-full resize-none rounded-lg border border-line bg-navy-900 p-3 text-sm normal-case tracking-normal text-white outline-none focus:border-accent disabled:opacity-60"
            />
          </label>

          {active ? (
            <button
              type="button"
              onClick={end}
              className="w-full rounded-lg bg-danger px-4 py-3 text-sm font-semibold text-navy-950 hover:brightness-110"
            >
              End conversation
            </button>
          ) : (
            <button
              type="button"
              onClick={() => start(persona)}
              disabled={persona.trim().length === 0}
              className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-navy-950 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "error" ? "Try again" : "Start conversation"}
            </button>
          )}

          {error ? (
            <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
              {error}
            </p>
          ) : null}
          {saveState === "saving" ? (
            <p role="status" className="text-xs text-muted">
              Saving session…
            </p>
          ) : null}
          {saveState === "saved" ? (
            <p role="status" className="text-xs text-ok">
              Session saved to your history.
            </p>
          ) : null}
          {saveState === "failed" ? (
            <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
              Could not save this session, so it may be missing from the dashboard.
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="rounded-lg border border-line bg-navy-900 p-3 text-xs text-muted">
              {notice}
            </p>
          ) : null}
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Transcript</p>
          {transcript.length === 0 ? (
            <EmptyState
              title={status === "connected" ? "Listening…" : "No conversation yet"}
              body={
                status === "connected"
                  ? "Say something. Transcripts appear here as the API provides them."
                  : "Transcripts will appear here during a session, when the API provides them."
              }
            />
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-line bg-navy-900 p-3">
              {transcript.map((t) => (
                <div key={t.id} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                  <p
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      t.role === "user" ? "bg-accent/15 text-white" : "bg-navy-700 text-white"
                    }`}
                  >
                    <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted">
                      {t.role === "user" ? "You" : "MMA AI"}
                    </span>
                    {t.text}
                  </p>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      {usage.length > 0 ? (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Session usage from API (raw messages, for verification)
          </p>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Prompt</th>
                  <th className="px-3 py-2 font-medium">Response</th>
                  <th className="px-3 py-2 font-medium">Thoughts</th>
                  <th className="px-3 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.seq} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-2">{u.seq}</td>
                    <td className="px-3 py-2">{formatNumber(u.promptTokens)}</td>
                    <td className="px-3 py-2">{formatNumber(u.responseTokens)}</td>
                    <td className="px-3 py-2">{formatNumber(u.thoughtsTokens)}</td>
                    <td className="px-3 py-2">{formatNumber(u.totalTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
