import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function timingSafeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export async function POST(req: Request) {
  try {
    const secretHash = process.env.FLW_SECRET_HASH;
    const flwSecretKey = process.env.FLW_SECRET_KEY;

    if (!secretHash) return NextResponse.json({ ok: false, message: "Missing FLW_SECRET_HASH" }, { status: 500 });
    if (!flwSecretKey) return NextResponse.json({ ok: false, message: "Missing FLW_SECRET_KEY" }, { status: 500 });

    const signature = req.headers.get("verif-hash") || "";
    if (!signature) return NextResponse.json({ ok: false, message: "Missing verif-hash" }, { status: 401 });
    if (!timingSafeEqual(signature, secretHash)) {
      return NextResponse.json({ ok: false, message: "Invalid signature" }, { status: 401 });
    }

    const raw = await req.text();
    const payload = JSON.parse(raw) as unknown;

    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ ok: false, message: "Invalid payload" }, { status: 400 });
    }

    const p = payload as Record<string, unknown>;
    const event = String(p.event ?? "");

    // Acknowledge non-target events
    if (event !== "charge.completed") return NextResponse.json({ ok: true, ignored: true });

    const data = p.data as Record<string, unknown> | undefined;
    const tx_ref = String(data?.tx_ref ?? "");
    const transaction_id = String(data?.id ?? "");

    if (!tx_ref || !transaction_id) {
      return NextResponse.json({ ok: false, message: "Missing tx_ref or transaction id" }, { status: 400 });
    }

    // Verify with Flutterwave API to prevent spoofed webhook
    const verifyRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
      headers: { Authorization: `Bearer ${flwSecretKey}` },
    });

    const verifyJson = (await verifyRes.json()) as unknown;
    if (!verifyRes.ok || !verifyJson || typeof verifyJson !== "object") {
      return NextResponse.json({ ok: false, message: "Verify failed" }, { status: 400 });
    }

    const vData = (verifyJson as Record<string, unknown>).data as Record<string, unknown> | undefined;
    const vStatus = String(vData?.status ?? "");
    const vCurrency = String(vData?.currency ?? "");
    const vAmountRaw = Number(vData?.amount);
    const vAmount = Number.isFinite(vAmountRaw) ? Math.round(vAmountRaw) : null;

    const REQUIRED_AMOUNT = 1999;

    if (vStatus !== "successful" || vCurrency !== "NGN" || vAmount !== REQUIRED_AMOUNT) {
      // best-effort update for traceability
      await supabase
        .from("sessions")
        .update({
          payment_status: `amount_mismatch_or_failed:${vStatus || "unknown"}`,
          flw_tx_ref: tx_ref,
          flw_transaction_id: transaction_id,
          amount_paid_ngn: vAmount,
          payment_verified_at: new Date().toISOString(),
        })
        .eq("flw_tx_ref", tx_ref);

      return NextResponse.json({ ok: true, unlocked: false });
    }

    // Find session by tx_ref
    const { data: sess, error: sessErr } = await supabase
      .from("sessions")
      .select("session_id, unlocked")
      .eq("flw_tx_ref", tx_ref)
      .maybeSingle();

    if (sessErr) return NextResponse.json({ ok: false, message: sessErr.message }, { status: 500 });

    let session_id = sess?.session_id as string | undefined;

    // fallback: tx_ref pattern S2E-<session_id>-<timestamp>
    if (!session_id) {
      const parts = tx_ref.split("-");
      if (parts.length >= 3) session_id = parts[1];
    }

    if (!session_id) return NextResponse.json({ ok: false, message: "Cannot map tx_ref to session" }, { status: 400 });

    // upsert session if missing
    await supabase.from("sessions").upsert({ session_id }, { onConflict: "session_id" });

    if (sess?.unlocked) return NextResponse.json({ ok: true, unlocked: true, already: true });

    const { error: updErr } = await supabase
      .from("sessions")
      .update({
        unlocked: true,
        unlocked_at: new Date().toISOString(),
        unlocked_via: "payment",
        payment_status: "successful",
        payment_verified_at: new Date().toISOString(),
        flw_tx_ref: tx_ref,
        flw_transaction_id: transaction_id,
        amount_paid_ngn: vAmount,
      })
      .eq("session_id", session_id);

    if (updErr) return NextResponse.json({ ok: false, message: updErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, unlocked: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, message: msg }, { status: 400 });
  }
}
