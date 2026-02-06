import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CreateProspectBody = {
  discovery_request_id: string;

  name: string;
  provider_type?: "individual" | "school" | null;

  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;

  country?: string | null; // default Nigeria
  state?: string | null;
  city: string;
  area: string;
  address?: string | null;

  latitude?: number | null;
  longitude?: number | null;

  mode_supported?: "Physical" | "Online" | null;

  source?: string | null; // manual | google_maps | directory | social
  source_url?: string | null;
  evidence_urls?: string[] | null;

  notes?: string | null;
};

type Ok = { ok: true; prospect_id: string };
type Err = { ok: false; error: string };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function asNullableString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function asNullableNumber(v: unknown): number | null {
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v)) return null;
  return v;
}

function cleanTextArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const cleaned = v
    .filter((x) => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return Array.from(new Set(cleaned));
}

function normalizePhone(phone: string): string {
  // store as digits + leading + if present
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
}

export async function POST(req: NextRequest): Promise<NextResponse<Ok | Err>> {
  // Simple protection so random people can’t hit admin routes.
  // Add ADMIN_API_KEY in env (Vercel + local).
  const adminKey = process.env.ADMIN_API_KEY;
  const providedKey = req.headers.get("x-admin-key");
  if (!adminKey || !providedKey || providedKey !== adminKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: "Server misconfigured: missing Supabase env vars" }, { status: 500 });
  }

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const b = bodyUnknown as Partial<CreateProspectBody>;

  if (!isNonEmptyString(b.discovery_request_id)) {
    return NextResponse.json({ ok: false, error: "discovery_request_id is required" }, { status: 400 });
  }
  if (!isNonEmptyString(b.name)) {
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  }
  if (!isNonEmptyString(b.city) || !isNonEmptyString(b.area)) {
    return NextResponse.json({ ok: false, error: "city and area are required" }, { status: 400 });
  }

  const phoneRaw = asNullableString(b.phone);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;

  const evidence_urls = cleanTextArray(b.evidence_urls);

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // Upsert strategy:
  // - If phone exists, try update by phone
  // - Else try update by lower(name)+lower(city)+lower(area)
  // - Else insert
  const name = b.name.trim();
  const city = b.city.trim();
  const area = b.area.trim();

  // 1) Try find existing prospect
  let existingProspectId: string | null = null;

  if (phone) {
    const findByPhone = await supabase
      .from("provider_prospects")
      .select("id")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();

    if (findByPhone.error) {
      return NextResponse.json({ ok: false, error: `DB error: ${findByPhone.error.message}` }, { status: 500 });
    }
    existingProspectId = findByPhone.data?.id ? (findByPhone.data.id as string) : null;
  }

  if (!existingProspectId) {
    const findByNameLoc = await supabase
      .from("provider_prospects")
      .select("id")
      .ilike("name", name) // OK for MVP; can be improved
      .eq("city", city)
      .eq("area", area)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findByNameLoc.error) {
      return NextResponse.json({ ok: false, error: `DB error: ${findByNameLoc.error.message}` }, { status: 500 });
    }
    existingProspectId = findByNameLoc.data?.id ? (findByNameLoc.data.id as string) : null;
  }

  const payload = {
    discovery_request_id: b.discovery_request_id.trim(),
    name,
    provider_type: asNullableString(b.provider_type),
    phone,
    whatsapp: asNullableString(b.whatsapp),
    email: asNullableString(b.email),
    website: asNullableString(b.website),

    country: asNullableString(b.country) ?? "Nigeria",
    state: asNullableString(b.state),
    city,
    area,
    address: asNullableString(b.address),
    latitude: asNullableNumber(b.latitude),
    longitude: asNullableNumber(b.longitude),

    mode_supported: asNullableString(b.mode_supported),

    source: asNullableString(b.source) ?? "manual",
    source_url: asNullableString(b.source_url),
    evidence_urls,

    status: "new",
    notes: asNullableString(b.notes),
    updated_at: new Date().toISOString(),
  };

  let prospect_id: string;

  if (existingProspectId) {
    const upd = await supabase
      .from("provider_prospects")
      .update(payload)
      .eq("id", existingProspectId)
      .select("id")
      .single();

    if (upd.error || !upd.data?.id) {
      return NextResponse.json({ ok: false, error: `Failed to update prospect: ${upd.error?.message ?? "unknown"}` }, { status: 500 });
    }
    prospect_id = upd.data.id as string;
  } else {
    const ins = await supabase
      .from("provider_prospects")
      .insert([payload])
      .select("id")
      .single();

    if (ins.error || !ins.data?.id) {
      return NextResponse.json({ ok: false, error: `Failed to create prospect: ${ins.error?.message ?? "unknown"}` }, { status: 500 });
    }
    prospect_id = ins.data.id as string;
  }

  // 2) Mark discovery request fulfilled (since we have at least 1 prospect now)
  const updReq = await supabase
    .from("provider_discovery_requests")
    .update({ status: "fulfilled", updated_at: new Date().toISOString() })
    .eq("id", b.discovery_request_id.trim());

  if (updReq.error) {
    // not fatal
  }

  // 3) (Optional) Create outreach thread - but your table currently references providers, not prospects.
  // Since you said nurturing later, we'll skip outreach thread creation for prospects here.
  // If you want outreach now, we’ll add provider_prospect_outreach_threads or extend your existing threads table.

  return NextResponse.json({ ok: true, prospect_id }, { status: 201 });
}
