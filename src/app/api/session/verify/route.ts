import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const Schema = z.object({
  code: z.string().min(2),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { code } = Schema.parse(body);

    // Just check coupon validity (no increment here)
    const { data, error } = await supabase
      .from("coupons")
      .select("code, description, active, max_uses, used_count, starts_at, expires_at, unlocks")
      .eq("code", code.trim().toUpperCase())
      .maybeSingle();

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, message: "Invalid coupon code" }, { status: 200 });

    if (!data.active) return NextResponse.json({ ok: false, message: "Coupon is not active" }, { status: 200 });

    const now = Date.now();
    if (data.starts_at && now < new Date(data.starts_at).getTime())
      return NextResponse.json({ ok: false, message: "Coupon is not yet valid" }, { status: 200 });

    if (data.expires_at && now > new Date(data.expires_at).getTime())
      return NextResponse.json({ ok: false, message: "Coupon has expired" }, { status: 200 });

    if (data.max_uses != null && data.used_count >= data.max_uses)
      return NextResponse.json({ ok: false, message: "Coupon usage limit reached" }, { status: 200 });

    if (!data.unlocks) return NextResponse.json({ ok: false, message: "Coupon does not unlock results" }, { status: 200 });

    return NextResponse.json({
      ok: true,
      message: "Coupon is valid",
      coupon: { code: data.code, description: data.description ?? "" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
