import { Modality, type LiveConnectConfig } from "@google/genai";

export const DEFAULT_LIVE_MODEL = "gemini-3.8-live";
export const MAX_PERSONA_LENGTH = 2000;

/**
 * Single source of truth for the Live session config. The server locks the
 * ephemeral token to this config; the browser passes the same config on connect.
 */
export function buildLiveConfig(persona: string): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: persona,
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}
