// Milestone 4a: verify the Gemini Live connection from the terminal (no microphone).
// Run:  npm run test:live
// Reads GEMINI_API_KEY from .env.local via Node's --env-file. Never prints the key.
import { GoogleGenAI, Modality } from "@google/genai";

const MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live"; // from official docs; override via env
const PERSONA = "You are a friendly, concise voice assistant. Keep answers to one short sentence.";

if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is missing. Check .env.local.");
  process.exit(1);
}

const liveConfig = {
  responseModalities: [Modality.AUDIO],
  systemInstruction: PERSONA,
  inputAudioTranscription: {},
  outputAudioTranscription: {},
};

function exchange(ai, label) {
  return new Promise((resolve) => {
    const result = { label, ok: false, transcript: "", audioBytes: 0, usage: [], error: null, closeReason: null };
    let session;
    const timer = setTimeout(() => {
      result.error ??= "timed out after 30s waiting for turnComplete";
      try { session?.close(); } catch {}
      resolve(result);
    }, 30000);

    const finish = () => { clearTimeout(timer); try { session?.close(); } catch {} resolve(result); };

    ai.live
      .connect({
        model: MODEL,
        config: liveConfig,
        callbacks: {
          onopen: () => {},
          onmessage: (msg) => {
            if (msg.usageMetadata) result.usage.push(msg.usageMetadata);
            const sc = msg.serverContent;
            if (sc?.outputTranscription?.text) result.transcript += sc.outputTranscription.text;
            for (const p of sc?.modelTurn?.parts ?? []) {
              if (p.inlineData?.data) result.audioBytes += Buffer.from(p.inlineData.data, "base64").length;
            }
            if (sc?.turnComplete) { result.ok = result.audioBytes > 0 || result.transcript.length > 0; finish(); }
          },
          onerror: (e) => { result.error = e?.message ?? String(e); },
          onclose: (e) => { result.closeReason = e?.reason || `code ${e?.code}`; if (!result.ok) finish(); },
        },
      })
      .then((s) => {
        session = s;
        s.sendRealtimeInput({ text: "Say hello and tell me one fun fact." });
      })
      .catch((e) => { result.error = e?.message ?? String(e); finish(); });
  });
}

function report(r) {
  console.log(`\n=== ${r.label}: ${r.ok ? "PASS" : "FAIL"}`);
  if (r.error) console.log("error:", r.error);
  if (r.closeReason) console.log("close reason:", r.closeReason);
  console.log("model audio bytes received:", r.audioBytes);
  console.log("model transcript:", JSON.stringify(r.transcript));
  const last = r.usage.at(-1);
  console.log("usageMetadata messages seen:", r.usage.length);
  if (last) console.log("last usageMetadata:", JSON.stringify(last));
}

const direct = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

console.log("Model under test:", MODEL);
try {
  const names = [];
  const pager = await direct.models.list();
  for await (const m of pager) {
    if (m.supportedActions?.includes("bidiGenerateContent")) names.push(m.name);
  }
  console.log("\nModels reporting bidiGenerateContent (Live) support:");
  console.log(names.length ? names.join("\n") : "(none listed)");
  if (names.length && !names.some((n) => n === MODEL || n === `models/${MODEL}`)) {
    console.log(`\nWARNING: "${MODEL}" is not in that list. Set GEMINI_LIVE_MODEL to one of the names above.`);
  }
} catch (e) {
  console.log("Could not list models:", e?.message ?? e);
}

report(await exchange(direct, "1) Direct connection with API key (server-side)"));

try {
  const now = Date.now();
  const token = await direct.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
      liveConnectConstraints: { model: MODEL, config: liveConfig },
    },
  });
  console.log("\nEphemeral token created:", token.name ? "yes" : "no", "(value not printed)");
  const viaToken = new GoogleGenAI({ apiKey: token.name, httpOptions: { apiVersion: "v1alpha" } });
  report(await exchange(viaToken, "2) Connection using ephemeral token (what the browser will do)"));
} catch (e) {
  console.log("\n=== 2) Ephemeral token: FAIL");
  console.log("error:", e?.message ?? e);
}
process.exit(0);
