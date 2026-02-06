import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ProviderFinderV1Response = {
  ok: true;
  supply_exists: boolean;
  message: "SUPPLY_EXISTS" | "NO_SUPPLY";
  discovery_request_id: string | null;
};

type ErrorResponse = { ok: false; error: string };

function reqParam(url: URL, key: string): string | null {
  const v = url.searchParams.get(key);
  if (!v) return null;
  const t = v.trim();
  return t.length ? t : null;
}

function optParam(url: URL, key: string): string | null {
  const v = url.searchParams.get(key);
  if (!v) return null;
  const t = v.trim();
  return t.length ? t : null;
}

function parseRadiusKm(url: URL): number {
  const raw = url.searchParams.get("radius_km");
  if (!raw) return 5;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 5;
  return Math.min(Math.max(Math.round(n), 1), 50);
}

export async function GET(
  req: NextRequest
): Promise<NextResponse<ProviderFinderV1Response | ErrorResponse>> {
  const url = new URL(req.url);

  const skill_code = reqParam(url, "skill_code");
  const country = "Nigeria";
  const state = optParam(url, "state");
  const city = reqParam(url, "city");
  const area = reqParam(url, "area");
  const radius_km = parseRadiusKm(url);

  if (!skill_code || !city || !area) {
    return NextResponse.json(
      { ok: false, error: "Missing required query params: skill_code, city, area" },
      { status: 400 }
    );
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

  // 1) Check if supply exists (fast existence query)
  // We only count VERIFIED+ACTIVE providers (adjust as you like)
  const supplyRes = await supabase
    .from("providers")
    .select(
      "id,provider_skill_offerings!inner(skill_code,is_active)",
      { count: "exact", head: true }
    )
    .eq("is_active", true)
    .in("verification_status", ["basic", "standard"])
    .eq("city", city)
    .eq("area", area)
    .eq("provider_skill_offerings.skill_code", skill_code)
    .eq("provider_skill_offerings.is_active", true);

  if (supplyRes.error) {
    return NextResponse.json(
      { ok: false, error: `DB error: ${supplyRes.error.message}` },
      { status: 500 }
    );
  }

  const supply_exists = (supplyRes.count ?? 0) > 0;

  if (supply_exists) {
    return NextResponse.json(
      { ok: true, supply_exists: true, message: "SUPPLY_EXISTS", discovery_request_id: null },
      { status: 200 }
    );
  }

  // 2) No supply -> create or reuse a discovery request (dedupe: open/in_progress only)
  const existingReq = await supabase
    .from("provider_discovery_requests")
    .select("id")
    .eq("skill_code", skill_code)
    .eq("city", city)
    .eq("area", area)
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingReq.error) {
    return NextResponse.json(
      { ok: false, error: `DB error: ${existingReq.error.message}` },
      { status: 500 }
    );
  }

  if (existingReq.data?.id) {
    return NextResponse.json(
      { ok: true, supply_exists: false, message: "NO_SUPPLY", discovery_request_id: existingReq.data.id as string },
      { status: 200 }
    );
  }

  const insertReq = await supabase
    .from("provider_discovery_requests")
    .insert([
      {
        skill_code,
        country,
        state: state ?? null,
        city,
        area,
        requested_radius_km: radius_km,
        requested_by: "user_flow",
        status: "open",
        notes: null,
      },
    ])
    .select("id")
    .single();

  if (insertReq.error || !insertReq.data?.id) {
    return NextResponse.json(
      { ok: false, error: `Failed to create discovery request: ${insertReq.error?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      supply_exists: false,
      message: "NO_SUPPLY",
      discovery_request_id: insertReq.data.id as string,
    },
    { status: 200 }
  );
}
