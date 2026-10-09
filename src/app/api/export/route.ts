import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const COLUMNS = [
  "id",
  "status",
  "model",
  "started_at",
  "ended_at",
  "duration_seconds",
  "end_reason",
  "usage_message_count",
  "prompt_tokens",
  "response_tokens",
  "thoughts_tokens",
  "input_text_tokens",
  "input_audio_tokens",
  "output_text_tokens",
  "output_audio_tokens",
  "estimated_cost_usd",
  "pricing_version",
  "persona",
] as const;

// Quote fields and neutralise spreadsheet formula injection (cells starting with = + - @).
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Export the signed-in user's sessions for downstream analytics. CSV has no transcripts; JSON can include them. */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const withTranscript = url.searchParams.get("transcript") === "1";

  const select = [...COLUMNS, ...(format === "json" && withTranscript ? (["transcript"] as const) : [])].join(", ");
  const { data, error } = await supabase
    .from("voice_sessions")
    .select(select)
    .order("started_at", { ascending: false })
    .limit(5000);
  if (error) return NextResponse.json({ error: "Could not export sessions." }, { status: 500 });

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const stamp = new Date().toISOString().slice(0, 10);
  const headers = {
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="voice-sessions-${stamp}.${format}"`,
  };

  if (format === "json") {
    return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), sessions: rows }, null, 2), {
      headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
    });
  }
  const csv = [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(","))].join("\n");
  return new NextResponse(csv + "\n", { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
}
