import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const Schema = z.object({
  session_id: z.string().min(6),
  transaction_id: z.string().min(1),
});

type VerifyApiResponse =
  | { ok: true; unlocked: true }
  | { ok: false; message: string; status?: string; currency?: string; amount?: number | null };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { session_id, transaction_id } = Schema.parse(body);

    const secret = process.env.FLW_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ ok: false, message: "Missing FLW_SECRET_KEY" } satisfies VerifyApiResponse, {
        status: 500,
      });
    }

    const verifyRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
      headers: { Authorization: `Bearer ${secret}` },
    });

    const json = (await verifyRes.json()) as unknown;

    if (!verifyRes.ok || !json || typeof json !== "object") {
      return NextResponse.json(
        { ok: false, message: "Verify request failed" } satisfies VerifyApiResponse,
        { status: 400 }
      );
    }

    const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined;

    const status = String(data?.status ?? "");
    const currency = String(data?.currency ?? "");
    const amountRaw = Number(data?.amount);
    const amount = Number.isFinite(amountRaw) ? Math.round(amountRaw) : null;

    const REQUIRED_AMOUNT = 1999;

    // Enforce: successful + NGN + exact amount
    if (status !== "successful" || currency !== "NGN" || amount !== REQUIRED_AMOUNT) {
      await supabase
        .from("sessions")
        .update({
          payment_status: `amount_mismatch_or_failed:${status || "unknown"}`,
          flw_transaction_id: String(transaction_id),
          amount_paid_ngn: amount,
          payment_verified_at: new Date().toISOString(),
        })
        .eq("session_id", session_id);

      return NextResponse.json(
        {
          ok: false,
          message: "Payment not valid for unlock (must be ₦1,999 NGN and successful).",
          status,
          currency,
          amount,
        } satisfies VerifyApiResponse,
        { status: 200 }
      );
    }

    // Unlock session
    const { error } = await supabase
      .from("sessions")
      .update({
        unlocked: true,
        unlocked_at: new Date().toISOString(),
        unlocked_via: "payment",
        payment_status: "successful",
        payment_verified_at: new Date().toISOString(),
        flw_transaction_id: String(transaction_id),
        amount_paid_ngn: amount,
      })
      .eq("session_id", session_id);

    if (error) {
      return NextResponse.json({ ok: false, message: error.message } satisfies VerifyApiResponse, { status: 500 });
    }

    return NextResponse.json({ ok: true, unlocked: true } satisfies VerifyApiResponse);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, message: msg } satisfies VerifyApiResponse, { status: 400 });
  }
}
