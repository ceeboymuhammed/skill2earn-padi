import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only
);

export async function POST(req: Request) {
  try {
    const { session_id, code } = await req.json();

    if (!session_id || !code) {
      return NextResponse.json(
        { ok: false, reason: "missing_fields" },
        { status: 400 }
      );
    }

    const userAgent = req.headers.get("user-agent") ?? null;

    // Optional: hash IP if you want. For MVP you can skip.
    // const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ipHash = null;

    const { data, error } = await supabase.rpc("redeem_coupon", {
      p_code: code,
      p_session_id: session_id,
      p_user_agent: userAgent,
      p_ip_hash: ipHash,
    });

    if (error) {
      console.error("redeem_coupon error:", error);
      return NextResponse.json({ ok: false, reason: "server_error" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
}
