import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type DiscoveryRequest = {
  id: string;
  skill_code: string;
  state: string | null;
  city: string;
  area: string;
  status: string;
  created_at: string;
};

type Ok = { ok: true; requests: DiscoveryRequest[] };
type Err = { ok: false; error: string };

export async function GET(req: NextRequest): Promise<NextResponse<Ok | Err>> {
  const adminKey = process.env.ADMIN_API_KEY;
  const providedKey = req.headers.get("x-admin-key");

  if (!adminKey || !providedKey || providedKey !== adminKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured: missing Supabase env vars" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const res = await supabase
    .from("provider_discovery_requests")
    .select("id,skill_code,state,city,area,status,created_at")
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (res.error) {
    return NextResponse.json({ ok: false, error: res.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, requests: (res.data ?? []) as DiscoveryRequest[] }, { status: 200 });
}
