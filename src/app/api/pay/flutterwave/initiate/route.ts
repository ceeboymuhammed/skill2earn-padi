export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";

const Schema = z.object({
  session_id: z.string().min(10),
  email: z.string().email(),
  full_name: z.string().min(2),
  phone: z.string().optional(),
});

function getBaseUrl(req: Request) {
  // Always correct in dev/prod
  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { session_id, email, full_name } = Schema.parse(body);

    const flwKey = process.env.FLW_SECRET_KEY;
    if (!flwKey) return NextResponse.json({ message: "Missing FLW_SECRET_KEY" }, { status: 500 });

    const baseUrl = process.env.APP_URL || getBaseUrl(req);

    // TODO: set your real amount/currency
    const amount = 2000; // NGN
    const currency = "NGN";

    const tx_ref = `s2e_${session_id}_${Date.now()}`;

    const payload = {
      tx_ref,
      amount,
      currency,
      redirect_url: `${baseUrl}/api/pay/flutterwave/callback?session_id=${encodeURIComponent(session_id)}`,
      customer: { email, name: full_name },
      customizations: {
        title: "Skill2Earn Padi",
        description: "Unlock Full Results",
      },
    };

    const resp = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${flwKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await resp.json();

    if (!resp.ok) {
      return NextResponse.json({ message: json?.message ?? "Flutterwave init failed", raw: json }, { status: 500 });
    }

    const link = json?.data?.link;
    if (!link) return NextResponse.json({ message: "Missing Flutterwave payment link" }, { status: 500 });

    return NextResponse.json({ ok: true, link });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
