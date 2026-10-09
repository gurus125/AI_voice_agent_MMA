import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { buildLiveConfig, DEFAULT_LIVE_MODEL, MAX_PERSONA_LENGTH } from "@/lib/liveConfig";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server is missing GEMINI_API_KEY." }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const persona =
    typeof body === "object" && body !== null && "persona" in body
      ? (body as { persona: unknown }).persona
      : undefined;
  if (typeof persona !== "string" || persona.trim().length === 0) {
    return NextResponse.json({ error: "A persona (system instructions) is required." }, { status: 400 });
  }
  if (persona.length > MAX_PERSONA_LENGTH) {
    return NextResponse.json(
      { error: `Persona must be at most ${MAX_PERSONA_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const model = process.env.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL;

  // Cost guard: cap how many sessions one user can start per hour (counts only their own rows via RLS).
  // The count and the token creation are independent, so they run at the same time to save a round trip.
  const maxPerHour = Number(process.env.MAX_SESSIONS_PER_HOUR) || 30;
  const countPromise = supabase
    .from("voice_sessions")
    .select("id", { count: "exact", head: true })
    .gte("started_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  const tokenPromise = (async () => {
    const ai = new GoogleGenAI({ apiKey });
    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
        liveConnectConstraints: { model, config: buildLiveConfig(persona.trim()) },
      },
    });
    if (!token.name) throw new Error("No token returned");
    return token.name;
  })();
  tokenPromise.catch(() => {}); // handled below; stops a stray unhandled-rejection warning if we return early

  const { count } = await countPromise;
  if ((count ?? 0) >= maxPerHour) {
    return NextResponse.json(
      { error: `Session limit reached (${maxPerHour} per hour). Please try again later.` },
      { status: 429 },
    );
  }

  let tokenName: string;
  try {
    tokenName = await tokenPromise;
  } catch (err) {
    console.error("live-token error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not create a Live session token." }, { status: 502 });
  }

  const { data: session, error } = await supabase
    .from("voice_sessions")
    .insert({ model, persona: persona.trim() })
    .select("id")
    .single();
  if (error || !session) {
    console.error("session insert error:", error?.message);
    return NextResponse.json({ error: "Could not record the session." }, { status: 500 });
  }

  return NextResponse.json({ token: tokenName, model, sessionId: session.id });
}
