import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const Schema = z.object({
  session_id: z.string().min(6),
  email: z.string().email(),
  name: z.string().min(2),
  phone: z.string().optional(),
});

type Resp =
  | { ok: true; link: string; tx_ref: string }
  | { ok: false; message: string };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { session_id, email, name, phone } = Schema.parse(body);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const secret = process.env.FLW_SECRET_KEY;

    if (!appUrl) return NextResponse.json({ ok: false, message: "Missing NEXT_PUBLIC_APP_URL" } satisfies Resp, { status: 500 });
    if (!secret) return NextResponse.json({ ok: false, message: "Missing FLW_SECRET_KEY" } satisfies Resp, { status: 500 });

    const REQUIRED_AMOUNT = 1999;
    const tx_ref = `S2E-${session_id}-${Date.now()}`;

    // ensure session exists + track tx_ref
    await supabase.from("sessions").upsert({ session_id }, { onConflict: "session_id" });
    await supabase
      .from("sessions")
      .update({ flw_tx_ref: tx_ref, amount_paid_ngn: REQUIRED_AMOUNT, payment_status: "initiated" })
      .eq("session_id", session_id);

    const flwRes = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref,
        amount: REQUIRED_AMOUNT,
        currency: "NGN",
        redirect_url: `${appUrl}/pay/callback`,
        customer: {
          email,
          name,
          phonenumber: phone ?? "",
        },
        meta: { session_id },
        customizations: {
          title: "Skill2Earn Padi",
          description: "Unlock full recommendations & nearest training centres",
        },
      }),
    });

    const flwJson = (await flwRes.json()) as unknown;

    if (!flwRes.ok || !flwJson || typeof flwJson !== "object") {
      return NextResponse.json({ ok: false, message: "Flutterwave init failed" } satisfies Resp, { status: 400 });
    }

    const data = (flwJson as Record<string, unknown>).data as Record<string, unknown> | undefined;
    const link = typeof data?.link === "string" ? data.link : "";

    if (!link) return NextResponse.json({ ok: false, message: "No checkout link returned" } satisfies Resp, { status: 400 });

    return NextResponse.json({ ok: true, link, tx_ref } satisfies Resp);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, message: msg } satisfies Resp, { status: 400 });
  }
}
