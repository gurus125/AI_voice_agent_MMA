import type { RawUsage, ModalityCount } from "./pricing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

function count(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e9 ? Math.floor(v) : undefined;
}

function details(v: unknown): ModalityCount[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: ModalityCount[] = [];
  for (const d of v.slice(0, 8)) {
    if (!d || typeof d !== "object") continue;
    const rec = d as Record<string, unknown>;
    const c = count(rec.tokenCount);
    if (typeof rec.modality === "string" && rec.modality.length <= 32 && c !== undefined) {
      out.push({ modality: rec.modality, tokenCount: c });
    }
  }
  return out;
}

/** Keep only the known numeric fields of a client-sent usageMetadata object. */
export function sanitizeUsage(v: unknown): RawUsage | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const u = v as Record<string, unknown>;
  const out: RawUsage = {};
  for (const key of [
    "promptTokenCount",
    "responseTokenCount",
    "thoughtsTokenCount",
    "totalTokenCount",
    "cachedContentTokenCount",
  ] as const) {
    const c = count(u[key]);
    if (c !== undefined) out[key] = c;
  }
  const p = details(u.promptTokensDetails);
  const r = details(u.responseTokensDetails);
  if (p) out.promptTokensDetails = p;
  if (r) out.responseTokensDetails = r;
  return Object.keys(out).length > 0 ? out : null;
}

export interface TranscriptItem {
  role: "user" | "model";
  text: string;
  /** ISO timestamp of when this utterance started (client clock). */
  at?: string;
}

export function sanitizeTranscript(v: unknown): TranscriptItem[] {
  if (!Array.isArray(v)) return [];
  const out: TranscriptItem[] = [];
  for (const e of v.slice(0, 500)) {
    if (!e || typeof e !== "object") continue;
    const rec = e as Record<string, unknown>;
    if ((rec.role === "user" || rec.role === "model") && typeof rec.text === "string") {
      const at =
        typeof rec.at === "string" && rec.at.length <= 40 && !Number.isNaN(Date.parse(rec.at))
          ? new Date(rec.at).toISOString()
          : undefined;
      out.push({ role: rec.role, text: rec.text.slice(0, 5000), ...(at ? { at } : {}) });
    }
  }
  return out;
}
