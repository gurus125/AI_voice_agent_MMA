// Cost ESTIMATION from Gemini Live usageMetadata. Not a provider billing figure.
// No path aliases here: this file is also imported directly by scripts/test-pricing.mjs.

export const PRICING_VERSION = "gemini-live-2026-10-09";
export const PRICING_SOURCE_URL = "https://ai.google.dev/gemini-api/docs/pricing";

/**
 * USD per 1M tokens, paid tier, for gemini-3.8-live, as read from the pricing page on 2026-10-09.
 * Re-check PRICING_SOURCE_URL before relying on these numbers and bump PRICING_VERSION if they change.
 */
export const RATES_USD_PER_MILLION = {
  textInput: 0.75,
  audioInput: 3.0,
  textOutput: 4.5,
  audioOutput: 12.0,
} as const;

export interface ModalityCount {
  modality: string;
  tokenCount: number;
}

/** The subset of the API's usageMetadata that we store and use. */
export interface RawUsage {
  promptTokenCount?: number;
  responseTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
  promptTokensDetails?: ModalityCount[];
  responseTokensDetails?: ModalityCount[];
}

export interface UsageTotals {
  messageCount: number;
  promptTokens: number;
  responseTokens: number;
  thoughtsTokens: number;
  inputTextTokens: number;
  inputAudioTokens: number;
  outputTextTokens: number;
  outputAudioTokens: number;
  estimatedCostUsd: number;
}

function n(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

function sumModality(details: ModalityCount[] | undefined, modality: string): number {
  return (details ?? []).filter((d) => d.modality === modality).reduce((a, d) => a + n(d.tokenCount), 0);
}

/**
 * Assumptions (also documented in the README):
 * 1. Every usageMetadata message is one billed generation. Prompt tokens are the whole context sent for
 *    that turn, so they are summed across messages. No caching discounts are applied, so this can overstate.
 * 2. Tokens counted in prompt/response totals but missing from the per-modality breakdown are priced at the
 *    higher AUDIO rate, so the estimate leans high rather than low.
 * 3. Thinking ("thoughts") tokens are not included in the API's total. They are priced at the text-output
 *    rate here. How Google actually bills them for Live models is not documented in the pages we read.
 */
export function summarizeUsage(messages: RawUsage[]): UsageTotals {
  const t: UsageTotals = {
    messageCount: messages.length,
    promptTokens: 0,
    responseTokens: 0,
    thoughtsTokens: 0,
    inputTextTokens: 0,
    inputAudioTokens: 0,
    outputTextTokens: 0,
    outputAudioTokens: 0,
    estimatedCostUsd: 0,
  };

  for (const m of messages) {
    const prompt = n(m.promptTokenCount);
    const response = n(m.responseTokenCount);
    const inText = sumModality(m.promptTokensDetails, "TEXT");
    const inAudio = sumModality(m.promptTokensDetails, "AUDIO");
    const outText = sumModality(m.responseTokensDetails, "TEXT");
    const outAudio = sumModality(m.responseTokensDetails, "AUDIO");

    // Other modalities (image/video/document) are not used by this app; anything unattributed goes to AUDIO.
    const inUnattributed = Math.max(0, prompt - inText - inAudio);
    const outUnattributed = Math.max(0, response - outText - outAudio);

    t.promptTokens += prompt;
    t.responseTokens += response;
    t.thoughtsTokens += n(m.thoughtsTokenCount);
    t.inputTextTokens += inText;
    t.inputAudioTokens += inAudio + inUnattributed;
    t.outputTextTokens += outText;
    t.outputAudioTokens += outAudio + outUnattributed;
  }

  const r = RATES_USD_PER_MILLION;
  const usd =
    (t.inputTextTokens * r.textInput +
      t.inputAudioTokens * r.audioInput +
      (t.outputTextTokens + t.thoughtsTokens) * r.textOutput +
      t.outputAudioTokens * r.audioOutput) /
    1_000_000;
  t.estimatedCostUsd = Math.round(usd * 1_000_000) / 1_000_000;
  return t;
}

export interface CostLine {
  label: string;
  tokens: number;
  ratePerMillionUsd: number;
  costUsd: number;
}

/** Itemised version of the estimate, so every dollar can be traced to a token count and a rate. */
export function costBreakdown(t: UsageTotals): CostLine[] {
  const r = RATES_USD_PER_MILLION;
  const line = (label: string, tokens: number, rate: number): CostLine => ({
    label,
    tokens,
    ratePerMillionUsd: rate,
    costUsd: Math.round(((tokens * rate) / 1_000_000) * 1_000_000) / 1_000_000,
  });
  return [
    line("Input: text", t.inputTextTokens, r.textInput),
    line("Input: audio (incl. unattributed)", t.inputAudioTokens, r.audioInput),
    line("Output: text", t.outputTextTokens, r.textOutput),
    line("Output: audio (incl. unattributed)", t.outputAudioTokens, r.audioOutput),
    line("Thinking (assumed text-output rate)", t.thoughtsTokens, r.textOutput),
  ];
}
