"use client";

import { useEffect, useRef } from "react";
import { useGeminiLive, type LiveStatus } from "@/hooks/useGeminiLive";

const statusText: Record<LiveStatus, string> = {
  idle: "Ready",
  "requesting-mic": "Waiting for microphone…",
  connecting: "Connecting…",
  connected: "Live",
  ending: "Ending…",
  error: "Error",
};

/** Compact voice agent for embedding in another page. Sessions are still logged to the signed-in user's history. */
export function EmbedAgent({ persona, title }: { persona: string; title: string }) {
  const { status, error, notice, transcript, start, end } = useGeminiLive();
  const endRef = useRef<HTMLDivElement>(null);
  const active = status === "connected" || status === "connecting" || status === "requesting-mic";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [transcript]);

  return (
    <div className="flex min-h-screen flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold text-white">{title}</h1>
        <span className="text-xs text-muted">{statusText[status]}</span>
      </div>

      <div className="min-h-[120px] flex-1 space-y-2 overflow-y-auto rounded-lg border border-line bg-navy-800 p-3">
        {transcript.length === 0 ? (
          <p className="text-xs text-muted">
            {status === "connected" ? "Listening… say something." : "Press the button and start talking."}
          </p>
        ) : (
          transcript.map((t) => (
            <p key={t.id} className={`text-sm ${t.role === "user" ? "text-accent" : "text-white"}`}>
              <span className="mr-1 text-[10px] uppercase tracking-wide text-muted">
                {t.role === "user" ? "You" : "Agent"}
              </span>
              {t.text}
            </p>
          ))
        )}
        <div ref={endRef} />
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-xs text-muted">{notice}</p> : null}

      {active ? (
        <button
          type="button"
          onClick={end}
          className="rounded-lg bg-danger px-4 py-3 text-sm font-semibold text-navy-950 hover:brightness-110"
        >
          End conversation
        </button>
      ) : (
        <button
          type="button"
          onClick={() => start(persona)}
          className="rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-navy-950 hover:brightness-110"
        >
          {status === "error" ? "Try again" : "Start conversation"}
        </button>
      )}
    </div>
  );
}
