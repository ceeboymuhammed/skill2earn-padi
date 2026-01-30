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

// Response types (no any)
type RespOk = { ok: true; link: string; tx_ref: string };
type RespErr = { ok: false; message: string; debug?: unknown };
type Resp = RespOk | RespErr;

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function pickMessageFromUnknown(u: unknown, fallback: string): string {
  if (!u || typeof u !== "object") return fallback;
  const o = u as Record<string, unknown>;
  if (typeof o.message === "string" && o.message.trim()) return o.message;
  if (typeof o.error === "string" && o.error.trim()) return o.error;
  return fallback;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { session_id, email, name, phone } = Schema.parse(body);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const secret = process.env.FLW_SECRET_KEY;

    if (!appUrl) {
      return NextResponse.json<Resp>({ ok: false, message: "Missing NEXT_PUBLIC_APP_URL" }, { status: 500 });
    }
    if (!secret) {
      return NextResponse.json<Resp>({ ok: false, message: "Missing FLW_SECRET_KEY" }, { status: 500 });
    }

    const REQUIRED_AMOUNT = 1999;
    const tx_ref = `S2E-${session_id}-${Date.now()}`;

    // ensure session exists + track tx_ref
    await supabase.from("sessions").upsert({ session_id }, { onConflict: "session_id" });
    await supabase
      .from("sessions")
      .update({
        flw_tx_ref: tx_ref,
        amount_paid_ngn: REQUIRED_AMOUNT,
        payment_status: "initiated",
      })
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

    const text = await flwRes.text();
    const flwJson = safeJsonParse(text);

    if (!flwRes.ok) {
      const msg = pickMessageFromUnknown(flwJson, `Flutterwave init failed: HTTP ${flwRes.status}`);
      return NextResponse.json<Resp>({ ok: false, message: msg, debug: flwJson }, { status: 400 });
    }

    // Extract link safely
    if (!flwJson || typeof flwJson !== "object") {
      return NextResponse.json<Resp>(
        { ok: false, message: "Flutterwave returned invalid response", debug: flwJson },
        { status: 400 }
      );
    }

    const data = (flwJson as Record<string, unknown>).data as Record<string, unknown> | undefined;
    const link = typeof data?.link === "string" ? data.link : "";

    if (!link) {
      return NextResponse.json<Resp>(
        { ok: false, message: "No checkout link returned by Flutterwave", debug: flwJson },
        { status: 400 }
      );
    }

    return NextResponse.json<RespOk>({ ok: true, link, tx_ref });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json<Resp>({ ok: false, message: msg }, { status: 400 });
  }
}
