export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createHash } from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const Schema = z.object({
  session_id: z.string().min(10),
  coupon_code: z.string().min(3),
});

function sha256Hex(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "0.0.0.0";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { session_id, coupon_code } = Schema.parse(body);

    const userAgent = req.headers.get("user-agent") || "";
    const ip = getClientIp(req);
    const ipHash = sha256Hex(ip);

    // 1) Redeem coupon (atomic in DB)
    const { data, error } = await supabase.rpc("redeem_coupon", {
      p_code: coupon_code,
      p_session_id: session_id,
      p_user_agent: userAgent,
      p_ip_hash: ipHash,
    });

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    // Supabase returns an array for RETURNS TABLE
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      return NextResponse.json({ message: "Coupon verification failed." }, { status: 500 });
    }

    if (!row.ok) {
      return NextResponse.json({ message: row.message || "Invalid coupon." }, { status: 400 });
    }

    // ✅ 2) IMPORTANT: If coupon redemption succeeded, unlock session.
    // Your /api/recommend gate checks sessions.unlocked, so we must set it here.
    const { error: sErr } = await supabase
      .from("sessions")
      .upsert(
        {
          session_id,
          unlocked: true,
          unlocked_via: "coupon",
          unlocked_at: new Date().toISOString(),
        },
        { onConflict: "session_id" }
      );

    if (sErr) {
      return NextResponse.json({ message: sErr.message }, { status: 500 });
    }

    // 3) Optional but helpful: reflect immediately in your submissions table
    await supabase
      .from("assessment_submissions_v1")
      .update({ unlocked: true })
      .eq("session_id", session_id);

    return NextResponse.json({
      ok: true,
      session_id,
      unlocked: true,
      message: row.message || "Coupon applied.",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}