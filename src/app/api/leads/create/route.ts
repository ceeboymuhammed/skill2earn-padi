import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type LeadType = "info_request" | "call_request" | "registration_request";
type PreferredContact = "phone" | "whatsapp" | "email";

type CreateLeadBody = {
  session_id: string;
  full_name: string;
  phone: string;
  whatsapp?: string | null;
  email?: string | null;

  state?: string | null;
  city: string;
  area: string;

  requested_skill_code: string;

  lead_type: LeadType;
  preferred_contact: PreferredContact;

  budget_min_naira?: number | null;
  budget_max_naira?: number | null;
  preferred_schedule?: string | null;

  notes?: string | null;
};

type ProviderType = "individual" | "school";
type VerificationStatus = "unverified" | "basic" | "standard" | "rejected";
type ModeSupported = "Physical" | "Online";

type ProviderRow = {
  id: string;
  provider_type: ProviderType;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;

  country: string;
  state: string;
  city: string;
  area: string;
  address: string | null;

  mode_supported: ModeSupported;
  verification_status: VerificationStatus;
  physical_delivery_percent: number;

  is_active: boolean;
};

type ProviderSkillOfferingRow = {
  id: string;
  provider_id: string;
  skill_code: string;
  is_active: boolean;
};

type MatchedProvider = {
  provider_id: string;
  name: string;
  provider_type: ProviderType;
  mode_supported: ModeSupported;
  city: string;
  area: string;
  verification_status: VerificationStatus;
  rank: number;
  match_reason: "same_area_physical" | "city_online_fallback";
};

type CreateLeadResponse = {
  ok: true;
  lead_id: string;
  assigned_provider_id: string | null;
  matched_providers: MatchedProvider[];
};

type ErrorResponse = { ok: false; error: string };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isLeadType(v: unknown): v is LeadType {
  return v === "info_request" || v === "call_request" || v === "registration_request";
}

function isPreferredContact(v: unknown): v is PreferredContact {
  return v === "phone" || v === "whatsapp" || v === "email";
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

export async function POST(
  req: NextRequest
): Promise<NextResponse<CreateLeadResponse | ErrorResponse>> {
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

  const b = bodyUnknown as Partial<CreateLeadBody>;

  if (!isNonEmptyString(b.session_id)) {
    return NextResponse.json({ ok: false, error: "session_id is required" }, { status: 400 });
  }
  if (!isNonEmptyString(b.full_name)) {
    return NextResponse.json({ ok: false, error: "full_name is required" }, { status: 400 });
  }
  if (!isNonEmptyString(b.phone)) {
    return NextResponse.json({ ok: false, error: "phone is required" }, { status: 400 });
  }
  if (!isNonEmptyString(b.city) || !isNonEmptyString(b.area)) {
    return NextResponse.json({ ok: false, error: "city and area are required" }, { status: 400 });
  }
  if (!isNonEmptyString(b.requested_skill_code)) {
    return NextResponse.json({ ok: false, error: "requested_skill_code is required" }, { status: 400 });
  }
  if (!isLeadType(b.lead_type)) {
    return NextResponse.json(
      { ok: false, error: "lead_type must be info_request | call_request | registration_request" },
      { status: 400 }
    );
  }
  if (!isPreferredContact(b.preferred_contact)) {
    return NextResponse.json(
      { ok: false, error: "preferred_contact must be phone | whatsapp | email" },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // 1) Insert lead
  const leadInsert = await supabase
    .from("leads")
    .insert([
      {
        session_id: b.session_id.trim(),
        full_name: b.full_name.trim(),
        phone: b.phone.trim(),
        whatsapp: asNullableString(b.whatsapp),
        email: asNullableString(b.email),
        state: asNullableString(b.state),
        city: b.city.trim(),
        area: b.area.trim(),
        requested_skill_code: b.requested_skill_code.trim(),
        status: "new",
        lead_type: b.lead_type,
        preferred_contact: b.preferred_contact,
        budget_min_naira: asNullableNumber(b.budget_min_naira),
        budget_max_naira: asNullableNumber(b.budget_max_naira),
        preferred_schedule: asNullableString(b.preferred_schedule),
        notes: asNullableString(b.notes),
      },
    ])
    .select("id")
    .single();

  if (leadInsert.error || !leadInsert.data?.id) {
    return NextResponse.json(
      { ok: false, error: `Failed to create lead: ${leadInsert.error?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  const lead_id = leadInsert.data.id as string;

  // 2) Match providers (physical same area first)
  const providerSelect =
    "id,provider_type,name,phone,whatsapp,email,website,country,state,city,area,address,mode_supported,verification_status,physical_delivery_percent,is_active,offering:provider_skill_offerings!inner(id,provider_id,skill_code,is_active)";

  const physicalRes = await supabase
    .from("providers")
    .select(providerSelect)
    .eq("city", b.city.trim())
    .eq("area", b.area.trim())
    .eq("mode_supported", "Physical")
    .eq("is_active", true)
    .eq("offering.skill_code", b.requested_skill_code.trim())
    .eq("offering.is_active", true)
    .limit(10);

  if (physicalRes.error) {
    return NextResponse.json({ ok: false, error: `DB error: ${physicalRes.error.message}` }, { status: 500 });
  }

  const physicalRows = (physicalRes.data ?? []) as unknown as Array<
    ProviderRow & { offering: ProviderSkillOfferingRow }
  >;

  let matched: MatchedProvider[] = physicalRows.map((p, idx) => ({
    provider_id: p.id,
    name: p.name,
    provider_type: p.provider_type,
    mode_supported: p.mode_supported,
    city: p.city,
    area: p.area,
    verification_status: p.verification_status,
    rank: idx + 1,
    match_reason: "same_area_physical",
  }));

  // 3) Fallback to Online in same city
  if (matched.length === 0) {
    const onlineRes = await supabase
      .from("providers")
      .select(providerSelect)
      .eq("city", b.city.trim())
      .eq("mode_supported", "Online")
      .eq("is_active", true)
      .eq("offering.skill_code", b.requested_skill_code.trim())
      .eq("offering.is_active", true)
      .limit(10);

    if (onlineRes.error) {
      return NextResponse.json({ ok: false, error: `DB error: ${onlineRes.error.message}` }, { status: 500 });
    }

    const onlineRows = (onlineRes.data ?? []) as unknown as Array<
      ProviderRow & { offering: ProviderSkillOfferingRow }
    >;

    matched = onlineRows.map((p, idx) => ({
      provider_id: p.id,
      name: p.name,
      provider_type: p.provider_type,
      mode_supported: p.mode_supported,
      city: p.city,
      area: p.area,
      verification_status: p.verification_status,
      rank: idx + 1,
      match_reason: "city_online_fallback",
    }));
  }

  // 4) Insert matches
  if (matched.length > 0) {
    const matchRows = matched.map((m) => ({
      lead_id,
      provider_id: m.provider_id,
      rank: m.rank,
      match_reason: m.match_reason,
    }));

    const matchInsert = await supabase.from("lead_provider_matches").insert(matchRows);

    if (matchInsert.error) {
      return NextResponse.json(
        { ok: false, error: `Failed to save lead matches: ${matchInsert.error.message}` },
        { status: 500 }
      );
    }
  }

  // 5) Assign top provider (optional but helpful)
  const assigned_provider_id = matched.length > 0 ? matched[0].provider_id : null;

  if (assigned_provider_id) {
    const assign = await supabase
      .from("leads")
      .update({ assigned_provider_id, status: "matched", updated_at: new Date().toISOString() })
      .eq("id", lead_id);

    if (assign.error) {
      // Not fatal — lead exists and matches exist.
    }
  } else {
    // No providers -> create discovery request (optional; you already do it in providers/search)
    await supabase.from("provider_discovery_requests").insert([
      {
        skill_code: b.requested_skill_code.trim(),
        country: "Nigeria",
        state: asNullableString(b.state),
        city: b.city.trim(),
        area: b.area.trim(),
        requested_radius_km: 5,
        requested_by: "lead_create",
        status: "open",
      },
    ]);
  }

  return NextResponse.json(
    {
      ok: true,
      lead_id,
      assigned_provider_id,
      matched_providers: matched,
    },
    { status: 201 }
  );
}
