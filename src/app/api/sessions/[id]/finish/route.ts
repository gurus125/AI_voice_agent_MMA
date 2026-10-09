import { NextResponse } from "next/server";
import { finalizeSession } from "@/lib/sessions";
import { createClient } from "@/lib/supabase/server";
import { isUuid, sanitizeTranscript } from "@/lib/validation";

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
  const status = rec.status === "error" ? "error" : "completed";
  const endReason = typeof rec.endReason === "string" ? rec.endReason : "ended";

  const result = await finalizeSession(supabase, id, {
    status,
    endReason,
    transcript: sanitizeTranscript(rec.transcript),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
