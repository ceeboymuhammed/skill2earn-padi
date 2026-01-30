import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const Schema = z.object({
  session_id: z.string().min(8).optional(),
});

function generateSessionId() {
  // simple, good enough for MVP
  return "sess_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function POST(req: Request) {
  const body = Schema.parse(await req.json());
  const session_id = body.session_id ?? generateSessionId();

  // Ensure row exists
  const { data: existing, error: selErr } = await supabase
    .from("result_unlocks")
    .select("session_id,is_unlocked,unlock_method")
    .eq("session_id", session_id)
    .maybeSingle();

  if (selErr) return NextResponse.json({ message: selErr.message }, { status: 500 });

  if (!existing) {
    const { error: insErr } = await supabase.from("result_unlocks").insert({
      session_id,
      is_unlocked: false,
      unlock_method: "free_beta",
    });
    if (insErr) return NextResponse.json({ message: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ session_id });
}
