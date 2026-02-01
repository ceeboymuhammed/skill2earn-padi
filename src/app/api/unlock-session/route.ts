import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const Schema = z.object({
  session_id: z.string().min(6),
  coupon_code: z.string().min(3).optional(),
  free_unlock: z.boolean().optional(),
});

type Resp =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { session_id, coupon_code, free_unlock } = Schema.parse(body);

    // Only coupon unlock (free_unlock can be used later if you want)
    if (!coupon_code && !free_unlock) {
      return NextResponse.json<Resp>(
        { ok: false, message: "Coupon code is required." },
        { status: 400 }
      );
    }

    // Redeem coupon (RPC)
    if (coupon_code) {
      const { data, error } = await supabase.rpc("redeem_coupon", { p_code: coupon_code });
      if (error) {
        return NextResponse.json<Resp>(
          { ok: false, message: error.message },
          { status: 400 }
        );
      }

      const row = Array.isArray(data) ? data[0] : data;
      const ok = Boolean(row?.ok);
      const msg = typeof row?.message === "string" ? row.message : "Coupon check failed";

      if (!ok) {
        return NextResponse.json<Resp>(
          { ok: false, message: msg },
          { status: 400 }
        );
      }
    }

    // Mark session unlocked
    const { error: upErr } = await supabase
      .from("sessions")
      .update({ unlocked: true, unlocked_at: new Date().toISOString() })
      .eq("session_id", session_id);

    if (upErr) {
      return NextResponse.json<Resp>(
        { ok: false, message: upErr.message },
        { status: 400 }
      );
    }

    return NextResponse.json<Resp>({ ok: true, message: "Unlocked successfully." });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json<Resp>({ ok: false, message: msg }, { status: 400 });
  }
}
