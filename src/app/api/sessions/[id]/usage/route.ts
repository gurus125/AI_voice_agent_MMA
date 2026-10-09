import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid, sanitizeUsage } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid session id." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const rec = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const seq = rec.seq;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 1 || seq > 10000) {
    return NextResponse.json({ error: "Invalid seq." }, { status: 400 });
  }
  const usage = sanitizeUsage(rec.usage);
  if (!usage) return NextResponse.json({ error: "Invalid usage payload." }, { status: 400 });

  const { data: session } = await supabase.from("voice_sessions").select("status").eq("id", id).maybeSingle();
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  if (session.status !== "active") return NextResponse.json({ error: "Session already ended." }, { status: 409 });

  const { error } = await supabase.from("session_usage_events").insert({ session_id: id, seq, usage });
  if (error && error.code !== "23505") {
    // 23505 = duplicate seq: a retry of something already stored, which is fine.
    console.error("usage insert error:", error.message);
    return NextResponse.json({ error: "Could not store usage." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
