import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { buildLiveConfig, DEFAULT_LIVE_MODEL, MAX_PERSONA_LENGTH } from "@/lib/liveConfig";
import { buildProfileNote } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const t0 = Date.now();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const tAuth = Date.now() - t0;

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

  // The hourly-limit count and the user's saved profile are independent, so fetch them at the same time.
  const maxPerHour = Number(process.env.MAX_SESSIONS_PER_HOUR) || 30;
  const [{ count }, { data: profile }] = await Promise.all([
    supabase
      .from("voice_sessions")
      .select("id", { count: "exact", head: true })
      .gte("started_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()),
    supabase.from("profiles").select("display_name, about").eq("user_id", user.id).maybeSingle(),
  ]);
  const tCount = Date.now() - t0;
  if ((count ?? 0) >= maxPerHour) {
    return NextResponse.json(
      { error: `Session limit reached (${maxPerHour} per hour). Please try again later.` },
      { status: 429 },
    );
  }

  // What the agent is actually told: the chosen persona plus who the user is (built here, not in the browser).
  const fullPersona = persona.trim() + buildProfileNote(profile);

  let tokenName: string;
  let tToken = 0;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
        liveConnectConstraints: { model, config: buildLiveConfig(fullPersona) },
      },
    });
    if (!token.name) throw new Error("No token returned");
    tokenName = token.name;
    tToken = Date.now() - t0;
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

  const tDone = Date.now() - t0;
  return NextResponse.json(
    { token: tokenName, model, sessionId: session.id, persona: fullPersona },
    { headers: { "Server-Timing": `auth;dur=${tAuth}, count;dur=${tCount}, token;dur=${tToken}, total;dur=${tDone}` } },
  );
}
