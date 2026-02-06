import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ProviderType = "individual" | "school";
type ModeSupported = "Physical" | "Online";

type ProviderApplyBody = {
  provider_type: ProviderType;
  name: string;
  phone: string;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;

  country?: string | null; // default Nigeria
  state: string;
  city: string;
  area: string;
  address?: string | null;

  latitude?: number | null;
  longitude?: number | null;

  mode_supported: ModeSupported;
  physical_delivery_percent?: number | null;

  schedule_options?: string[] | null; // text[]
  payment_plan_available?: boolean | null;
  notes?: string | null;

  power_hours_per_day_min?: number | null;
  has_power_backup?: boolean | null;
  has_workspace?: boolean | null;
  has_training_laptops?: boolean | null;
  has_internet?: boolean | null;
  equipment_notes?: string | null;

  skill_codes: string[]; // must be non-empty
};

type ApplyOk = {
  ok: true;
  provider_id: string;
};

type ApplyErr = {
  ok: false;
  error: string;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isProviderType(v: unknown): v is ProviderType {
  return v === "individual" || v === "school";
}

function isModeSupported(v: unknown): v is ModeSupported {
  return v === "Physical" || v === "Online";
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

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asTextArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const cleaned = v
    .filter((x) => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // de-duplicate
  return Array.from(new Set(cleaned));
}

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApplyOk | ApplyErr>> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured: missing Supabase env vars" },
      { status: 500 }
    );
  }

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const b = bodyUnknown as Partial<ProviderApplyBody>;

  if (!isProviderType(b.provider_type)) {
    return NextResponse.json({ ok: false, error: "provider_type must be individual|school" }, { status: 400 });
  }
  if (!isNonEmptyString(b.name)) {
    return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  }
  if (!isNonEmptyString(b.phone)) {
    return NextResponse.json({ ok: false, error: "phone is required" }, { status: 400 });
  }
  if (!isNonEmptyString(b.state) || !isNonEmptyString(b.city) || !isNonEmptyString(b.area)) {
    return NextResponse.json({ ok: false, error: "state, city, area are required" }, { status: 400 });
  }
  if (!isModeSupported(b.mode_supported)) {
    return NextResponse.json({ ok: false, error: "mode_supported must be Physical|Online" }, { status: 400 });
  }

  const skill_codes = asTextArray(b.skill_codes);
  if (skill_codes.length === 0) {
    return NextResponse.json({ ok: false, error: "skill_codes must be a non-empty array" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const schedule_options = asTextArray(b.schedule_options);

  // 1) Insert provider (inactive until verified)
  const providerInsert = await supabase
    .from("providers")
    .insert([
      {
        provider_type: b.provider_type,
        name: b.name.trim(),
        phone: b.phone.trim(),
        whatsapp: asNullableString(b.whatsapp),
        email: asNullableString(b.email),
        website: asNullableString(b.website),

        country: asNullableString(b.country) ?? "Nigeria",
        state: b.state.trim(),
        city: b.city.trim(),
        area: b.area.trim(),
        address: asNullableString(b.address),

        latitude: asNullableNumber(b.latitude),
        longitude: asNullableNumber(b.longitude),

        mode_supported: b.mode_supported,
        physical_delivery_percent: typeof b.physical_delivery_percent === "number"
          ? Math.max(0, Math.min(100, Math.round(b.physical_delivery_percent)))
          : (b.mode_supported === "Physical" ? 100 : 0),

        verification_status: "unverified",
        schedule_options,
        payment_plan_available: asBool(b.payment_plan_available, false),
        notes: asNullableString(b.notes),
        is_active: false,

        power_hours_per_day_min: asNullableNumber(b.power_hours_per_day_min),
        has_power_backup: asBool(b.has_power_backup, false),
        has_workspace: asBool(b.has_workspace, true),
        has_training_laptops: asBool(b.has_training_laptops, false),
        has_internet: asBool(b.has_internet, false),
        equipment_notes: asNullableString(b.equipment_notes),
      },
    ])
    .select("id")
    .single();

  if (providerInsert.error || !providerInsert.data?.id) {
    return NextResponse.json(
      { ok: false, error: `Failed to create provider: ${providerInsert.error?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  const provider_id = providerInsert.data.id as string;

  // 2) Insert offerings (multiple skills)
  const offerings = skill_codes.map((skill_code) => ({
    provider_id,
    skill_code,
    is_active: true,
    payment_plan_available: asBool(b.payment_plan_available, false),
  }));

  const offeringInsert = await supabase.from("provider_skill_offerings").insert(offerings);

  if (offeringInsert.error) {
    // cleanup provider to avoid orphan record
    await supabase.from("providers").delete().eq("id", provider_id);
    return NextResponse.json(
      { ok: false, error: `Failed to create skill offerings: ${offeringInsert.error.message}` },
      { status: 500 }
    );
  }

  // 3) Insert email preferences (unsubscribe token)
  const prefInsert = await supabase.from("provider_email_preferences").insert([
    { provider_id, opted_out: false, unsubscribe_token: crypto.randomUUID() },
  ]);

  if (prefInsert.error) {
    await supabase.from("providers").delete().eq("id", provider_id);
    return NextResponse.json(
      { ok: false, error: `Failed to create email preferences: ${prefInsert.error.message}` },
      { status: 500 }
    );
  }

  // 4) Create outreach thread (so nurturing can pick it up)
  const threadInsert = await supabase.from("provider_outreach_threads").insert([
    { provider_id, status: "queued", source: "apply_form" },
  ]);

  if (threadInsert.error) {
    // not fatal to provider apply; you can still onboard them manually
  }

  return NextResponse.json({ ok: true, provider_id }, { status: 201 });
}
