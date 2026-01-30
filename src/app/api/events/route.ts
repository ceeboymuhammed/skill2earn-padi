import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { session_id, event_type, skill_code, provider_id, metadata } = body;

    if (!event_type) {
      return NextResponse.json({ message: "event_type required" }, { status: 400 });
    }

    const { error } = await supabase.from("app_events").insert({
      session_id: session_id ?? null,
      event_type,
      skill_code: skill_code ?? null,
      provider_id: provider_id ?? null,
      metadata: metadata ?? {},
    });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
  console.error("Event logging failed:", e);
  return NextResponse.json({ message: "Failed to log event" }, { status: 500 });
}
}
