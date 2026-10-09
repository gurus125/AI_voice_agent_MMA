"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GoogleGenAI,
  type LiveServerMessage,
  type Session,
  type UsageMetadata,
} from "@google/genai";
import { buildLiveConfig } from "@/lib/liveConfig";

export type LiveStatus = "idle" | "requesting-mic" | "connecting" | "connected" | "ending" | "error";

export type SaveState = "idle" | "saving" | "saved" | "failed";

export interface TranscriptEntry {
  id: number;
  role: "user" | "model";
  text: string;
  done: boolean;
  /** Epoch ms when this utterance started. */
  at: number;
}

/** One usageMetadata message exactly as the API sent it (nothing invented). */
export interface UsageMessage {
  seq: number;
  promptTokens: number | null;
  responseTokens: number | null;
  thoughtsTokens: number | null;
  totalTokens: number | null;
  raw: UsageMetadata;
}

function micErrorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone access was denied. Allow it in your browser's site settings, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No microphone was found on this device.";
  if (name === "NotReadableError") return "The microphone is in use by another application.";
  return "Could not access the microphone.";
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function useGeminiLive(options: { onSaved?: () => void } = {}) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [usage, setUsage] = useState<UsageMessage[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const sessionRef = useRef<Session | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodesRef = useRef<AudioNode[]>([]);
  const playingRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextPlayRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startMsRef = useRef(0);
  const activeRef = useRef(false);
  const endingRef = useRef(false);
  const idRef = useRef(0);
  const usageSeqRef = useRef(0);
  const goAwayRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const pendingRef = useRef<Promise<unknown>[]>([]);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const persistedRef = useRef(false);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  });
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const stopPlayback = useCallback(() => {
    for (const src of playingRef.current) {
      try {
        src.stop();
      } catch {}
    }
    playingRef.current.clear();
    nextPlayRef.current = 0;
  }, []);

  const teardown = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (startMsRef.current) setElapsedSeconds(Math.round((Date.now() - startMsRef.current) / 1000));
    for (const n of nodesRef.current) {
      try {
        n.disconnect();
      } catch {}
    }
    nodesRef.current = [];
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stopPlayback();
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    try {
      sessionRef.current?.close();
    } catch {}
    sessionRef.current = null;
    activeRef.current = false;
  }, [stopPlayback]);

  const persist = useCallback(async (status: "completed" | "error", endReason: string) => {
    const id = sessionIdRef.current;
    if (!id || persistedRef.current) return;
    persistedRef.current = true;
    setSaveState("saving");
    try {
      await Promise.allSettled(pendingRef.current); // make sure every usage message has been stored first
      pendingRef.current = [];
      const res = await fetch(`/api/sessions/${id}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          endReason,
          transcript: transcriptRef.current.map(({ role, text, at }) => ({ role, text, at: new Date(at).toISOString() })),
        }),
      });
      if (!res.ok) throw new Error(`finish failed (${res.status})`);
      setSaveState("saved");
      optionsRef.current.onSaved?.();
    } catch {
      setSaveState("failed");
    }
  }, []);

  const postUsage = useCallback((seq: number, usage: UsageMetadata) => {
    const id = sessionIdRef.current;
    if (!id) return;
    const p = fetch(`/api/sessions/${id}/usage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seq, usage }),
      keepalive: true,
    }).catch(() => {});
    pendingRef.current.push(p);
  }, []);

  const fail = useCallback(
    (message: string) => {
      if (endingRef.current) return;
      endingRef.current = true;
      teardown();
      setError(message);
      setStatus("error");
      void persist("error", message);
    },
    [teardown, persist],
  );

  const appendTranscript = useCallback((role: "user" | "model", text: string) => {
    const id = ++idRef.current;
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role && !last.done) {
        return [...prev.slice(0, -1), { ...last, text: last.text + text }];
      }
      return [...prev, { id, role, text, done: false, at: Date.now() }];
    });
  }, []);

  const finalizeTranscript = useCallback(() => {
    setTranscript((prev) => prev.map((e) => (e.done ? e : { ...e, done: true })));
  }, []);

  const playPcm24k = useCallback((b64: string) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const int16 = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2));
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;
    const buf = ctx.createBuffer(1, f32.length, 24000);
    buf.copyToChannel(f32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, nextPlayRef.current);
    src.start(startAt);
    nextPlayRef.current = startAt + buf.duration;
    playingRef.current.add(src);
    src.onended = () => playingRef.current.delete(src);
  }, []);

  const handleMessage = useCallback(
    (msg: LiveServerMessage) => {
      if (msg.usageMetadata) {
        const u = msg.usageMetadata;
        const seq = ++usageSeqRef.current;
        postUsage(seq, u);
        setUsage((prev) => [
          ...prev,
          {
            seq,
            promptTokens: u.promptTokenCount ?? null,
            responseTokens: u.responseTokenCount ?? null,
            thoughtsTokens: u.thoughtsTokenCount ?? null,
            totalTokens: u.totalTokenCount ?? null,
            raw: u,
          },
        ]);
      }
      if (msg.goAway) {
        goAwayRef.current = true;
        setNotice("The server will end this session soon (session time limit).");
      }
      const sc = msg.serverContent;
      if (!sc) return;
      if (sc.interrupted) {
        stopPlayback();
        finalizeTranscript();
      }
      for (const part of sc.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) playPcm24k(part.inlineData.data);
      }
      if (sc.inputTranscription?.text) appendTranscript("user", sc.inputTranscription.text);
      if (sc.outputTranscription?.text) appendTranscript("model", sc.outputTranscription.text);
      if (sc.turnComplete) finalizeTranscript();
    },
    [appendTranscript, finalizeTranscript, playPcm24k, stopPlayback, postUsage],
  );

  const start = useCallback(
    async (persona: string) => {
      if (activeRef.current) return;
      activeRef.current = true;
      endingRef.current = false;
      goAwayRef.current = false;
      usageSeqRef.current = 0;
      sessionIdRef.current = null;
      pendingRef.current = [];
      persistedRef.current = false;
      setSaveState("idle");
      setError(null);
      setNotice(null);
      setTranscript([]);
      setUsage([]);
      setElapsedSeconds(0);
      startMsRef.current = 0;

      if (!navigator.mediaDevices?.getUserMedia) {
        activeRef.current = false;
        setError("This browser does not support microphone capture.");
        setStatus("error");
        return;
      }

      const t0 = performance.now();
      const lap = (label: string) => console.log(`[live-timing] ${label}: ${Math.round(performance.now() - t0)} ms`);
      setStatus("connecting");
      // Ask for the microphone right away, but do not wait for it: the token request and the audio
      // engine setup below run at the same time, so the slowest one sets the pace instead of the sum.
      const micPromise = navigator.mediaDevices
        .getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
        .then(
          (stream) => {
            streamRef.current = stream;
            lap("microphone ready");
          },
          (e) => {
            throw new Error(micErrorMessage(e));
          },
        );
      try {
        // Run the two slow setup steps at the same time: asking our server for a token, and
        // getting the audio engine ready. Before, they ran one after the other.
        const ctx = new AudioContext();
        ctxRef.current = ctx;
        const audioReady = ctx.resume().then(() => ctx.audioWorklet.addModule("/pcm-capture-worklet.js")).then(() => lap("audio engine ready"));
        const tokenReady = (async () => {
          const res = await fetch("/api/live-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ persona }),
          });
          const body = (await res.json().catch(() => null)) as { token?: string; model?: string; sessionId?: string; error?: string } | null;
          if (!res.ok || !body?.token || !body.model || !body.sessionId) {
            throw new Error(body?.error ?? `Token request failed (${res.status}).`);
          }
          sessionIdRef.current = body.sessionId;
          lap(`token received (server: ${res.headers.get("server-timing") ?? "n/a"})`);
          return body as { token: string; model: string; sessionId: string };
        })();
        // Wait for all three to finish (even if one fails) so a saved session row is always known and can be closed.
        const settled = await Promise.allSettled([micPromise, tokenReady, audioReady]);
        const failed = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
        if (failed) throw failed.reason;
        const data = (settled[1] as PromiseFulfilledResult<{ token: string; model: string; sessionId: string }>).value;

        const ai = new GoogleGenAI({ apiKey: data.token, httpOptions: { apiVersion: "v1alpha" } });
        const session = await ai.live.connect({
          model: data.model,
          config: buildLiveConfig(persona),
          callbacks: {
            onmessage: handleMessage,
            onerror: (e) => fail(e?.message || "Connection error."),
            onclose: (e) => {
              if (endingRef.current) return;
              if (goAwayRef.current) {
                endingRef.current = true;
                teardown();
                setNotice("Session ended by the server (time limit). Start a new conversation to continue.");
                setStatus("idle");
                void persist("completed", "session time limit");
              } else {
                fail(`Connection closed${e?.reason ? `: ${e.reason}` : ` (code ${e?.code ?? "unknown"})`}.`);
              }
            },
          },
        });
        lap("connected to Gemini");
        if (endingRef.current || !streamRef.current || !ctxRef.current) {
          session.close();
          return;
        }
        sessionRef.current = session;

        const source = ctx.createMediaStreamSource(streamRef.current);
        const worklet = new AudioWorkletNode(ctx, "pcm-capture");
        const mute = ctx.createGain();
        mute.gain.value = 0; // keeps the worklet in the render graph without playing the mic back
        worklet.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
          try {
            sessionRef.current?.sendRealtimeInput({
              audio: { data: toBase64(ev.data), mimeType: "audio/pcm;rate=16000" },
            });
          } catch {}
        };
        source.connect(worklet);
        worklet.connect(mute);
        mute.connect(ctx.destination);
        nodesRef.current = [source, worklet, mute];

        startMsRef.current = Date.now();
        timerRef.current = setInterval(
          () => setElapsedSeconds(Math.round((Date.now() - startMsRef.current) / 1000)),
          1000,
        );
        setStatus("connected");
      } catch (e) {
        fail(e instanceof Error ? e.message : "Could not start the conversation.");
      }
    },
    [fail, handleMessage, teardown, persist],
  );

  const end = useCallback(() => {
    if (!activeRef.current) return;
    endingRef.current = true;
    setStatus("ending");
    finalizeTranscript();
    teardown();
    setStatus("idle");
    void persist("completed", "ended by user");
  }, [finalizeTranscript, teardown, persist]);

  useEffect(
    () => () => {
      const wasActive = activeRef.current;
      endingRef.current = true;
      teardown();
      if (wasActive) void persist("error", "left the page");
    },
    [teardown, persist],
  );

  useEffect(() => {
    // Best effort when the tab is closed mid-session; abandoned sessions are also cleaned up on the next dashboard load.
    const onHide = () => {
      const id = sessionIdRef.current;
      if (!id || !activeRef.current || persistedRef.current) return;
      persistedRef.current = true;
      const body = JSON.stringify({
        status: "error",
        endReason: "page closed",
        transcript: transcriptRef.current.map(({ role, text, at }) => ({ role, text, at: new Date(at).toISOString() })),
      });
      navigator.sendBeacon(`/api/sessions/${id}/finish`, new Blob([body], { type: "application/json" }));
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  return { status, error, notice, transcript, usage, elapsedSeconds, saveState, start, end };
}
