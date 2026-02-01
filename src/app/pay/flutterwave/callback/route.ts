export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getBaseUrl(req: Request) {
  return new URL(req.url).origin;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // "successful" if ok
  const transaction_id = url.searchParams.get("transaction_id");
  const session_id = url.searchParams.get("session_id");

  const baseUrl = process.env.APP_URL || getBaseUrl(req);

  // Always send user back to preview with a status
  const goBack = (s: string) =>
    NextResponse.redirect(`${baseUrl}/preview?session_id=${encodeURIComponent(session_id ?? "")}&pay_status=${encodeURIComponent(s)}`);

  if (!session_id) return goBack("missing_session");
  if (status !== "successful" || !transaction_id) return goBack("failed");

  const flwKey = process.env.FLW_SECRET_KEY;
  if (!flwKey) return goBack("server_misconfig");

  try {
    // Verify transaction with Flutterwave
    const v = await fetch(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
      headers: { Authorization: `Bearer ${flwKey}` },
    });

    const json = await v.json();
    const ok = v.ok && json?.status === "success" && json?.data?.status === "successful";

    if (!ok) return goBack("verify_failed");

    // Unlock session (this is the real gate)
    await supabase
      .from("sessions")
      .upsert(
        { session_id, unlocked: true, unlocked_via: "payment", unlocked_at: new Date().toISOString() },
        { onConflict: "session_id" }
      );

    await supabase
      .from("assessment_submissions_v1")
      .update({ unlocked: true, mode: "full" })
      .eq("session_id", session_id);

    return goBack("successful");
  } catch {
    return goBack("exception");
  }
}
