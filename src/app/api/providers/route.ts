import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const InputSchema = z.object({
  session_id: z.string().min(8),
  skill_code: z.string().min(1),
  state: z.string().min(1),
  city: z.string().min(1),
  area: z.string().optional(),
});

const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider_type: z.enum(["Individual", "TrainingCenter"]),
  phone: z.string().nullable(),
  whatsapp: z.string().nullable(),
  state: z.string(),
  city: z.string(),
  area: z.string().nullable(),
  address: z.string().nullable(),
  physical_delivery_percent: z.number().int().nullable(),
  mode_supported: z.enum(["Physical", "Online", "Hybrid"]).nullable(),
  has_power_backup: z.boolean(),
  has_training_laptops: z.boolean(),
  has_internet: z.boolean(),
});

const ProviderSkillRowSchema = z.object({
  skill_code: z.string(),
  course_fee_min_ngn: z.number().int().nullable(),
  course_fee_max_ngn: z.number().int().nullable(),
  duration_weeks: z.number().int().nullable(),
  physical_delivery_percent: z.number().int().nullable(),
  mode_supported: z.enum(["Physical", "Online", "Hybrid"]).nullable(),
  providers: ProviderSchema.nullable(),
});

type ProviderRow = z.infer<typeof ProviderSchema>;
type ProviderSkillRow = z.infer<typeof ProviderSkillRowSchema>;

type RankedProviderUnlocked = {
  provider_id: string;
  name: string;
  provider_type: ProviderRow["provider_type"];
  phone: string | null;
  whatsapp: string | null;
  state: string;
  city: string;
  area: string | null;
  address: string | null;
  mode_supported: "Physical" | "Online" | "Hybrid" | null;
  physical_delivery_percent: number;
  course_fee_min_ngn: number | null;
  course_fee_max_ngn: number | null;
  duration_weeks: number | null;
  capabilities: {
    has_power_backup: boolean;
    has_training_laptops: boolean;
    has_internet: boolean;
  };
  rank: number;
};

type RankedProviderLocked = {
  provider_id: string;
  name: string;
  provider_type: ProviderRow["provider_type"];
  state: string;
  city: string;
  area: string | null;
  mode_supported: "Physical" | "Online" | "Hybrid" | null;
  physical_delivery_percent: number;
  course_fee_min_ngn: number | null;
  course_fee_max_ngn: number | null;
  duration_weeks: number | null;
  rank: number;
};

export async function POST(req: Request) {
  const body = InputSchema.parse(await req.json());

  // 🔒 Unlock check
  const { data: unlockRow, error: unlockErr } = await supabase
    .from("result_unlocks")
    .select("is_unlocked")
    .eq("session_id", body.session_id)
    .maybeSingle();

  if (unlockErr) {
    return NextResponse.json({ message: unlockErr.message }, { status: 500 });
  }

  const isUnlocked = Boolean(unlockRow?.is_unlocked);

  const { data, error } = await supabase
    .from("provider_skills")
    .select(
      `
      skill_code,
      course_fee_min_ngn,
      course_fee_max_ngn,
      duration_weeks,
      physical_delivery_percent,
      mode_supported,
      providers:provider_id (
        id,
        name,
        provider_type,
        phone,
        whatsapp,
        state,
        city,
        area,
        address,
        physical_delivery_percent,
        mode_supported,
        has_power_backup,
        has_training_laptops,
        has_internet
      )
    `
    )
    .eq("skill_code", body.skill_code)
    .eq("is_active", true);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  // ✅ Correct: safeParse only takes ONE argument
  const parsed = z.array(ProviderSkillRowSchema).safeParse(data);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Provider data shape mismatch", issues: parsed.error.issues },
      { status: 500 }
    );
  }

  const rows: ProviderSkillRow[] = parsed.data;

  // rank: area > city > state
  const mapped = rows
    .map((row) => {
      const p = row.providers;
      if (!p) return null;

      // ✅ FIX: replace NGNNGN with ??
      // choose provider_skills physical% first, then providers physical%, else 0
      const physicalPct =
        row.physical_delivery_percent ?? p.physical_delivery_percent ?? 0;

      let rank = 99;
      if (
        p.state === body.state &&
        p.city === body.city &&
        body.area &&
        p.area === body.area
      )
        rank = 1;
      else if (p.state === body.state && p.city === body.city) rank = 2;
      else if (p.state === body.state) rank = 3;

      return { row, p, physicalPct, rank };
    })
    .filter(
      (
        x
      ): x is {
        row: ProviderSkillRow;
        p: ProviderRow;
        physicalPct: number;
        rank: number;
      } => x !== null
    )
    .filter((x) => x.physicalPct >= 10) // your physical rule
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 10);

  // ✅ DEDUPE: keep best-ranked entry per provider_id
  const uniqueMapped = Array.from(
    mapped
      .reduce((acc, item) => {
        const existing = acc.get(item.p.id);
        if (!existing || item.rank < existing.rank) acc.set(item.p.id, item);
        return acc;
      }, new Map<string, (typeof mapped)[number]>())
      .values()
  );

  // 🔒 If locked, return limited fields only
  if (!isUnlocked) {
    const lockedProviders: RankedProviderLocked[] = uniqueMapped.map(
      ({ row, p, physicalPct, rank }) => ({
        provider_id: p.id,
        name: p.name,
        provider_type: p.provider_type,
        state: p.state,
        city: p.city,
        area: p.area,
        // ✅ FIX: replace NGNNGN with ??
        mode_supported: row.mode_supported ?? p.mode_supported,
        physical_delivery_percent: physicalPct,
        course_fee_min_ngn: row.course_fee_min_ngn,
        course_fee_max_ngn: row.course_fee_max_ngn,
        duration_weeks: row.duration_weeks,
        rank,
      })
    );

    return NextResponse.json({
      unlocked: false,
      locked: true,
      message: "Unlock to view provider contact details and exact addresses.",
      providers: lockedProviders,
    });
  }

  // ✅ Unlocked: return full provider details
  const unlockedProviders: RankedProviderUnlocked[] = uniqueMapped.map(
    ({ row, p, physicalPct, rank }) => ({
      provider_id: p.id,
      name: p.name,
      provider_type: p.provider_type,
      phone: p.phone,
      whatsapp: p.whatsapp,
      state: p.state,
      city: p.city,
      area: p.area,
      address: p.address,
      // ✅ FIX: replace NGNNGN with ??
      mode_supported: row.mode_supported ?? p.mode_supported,
      physical_delivery_percent: physicalPct,
      course_fee_min_ngn: row.course_fee_min_ngn,
      course_fee_max_ngn: row.course_fee_max_ngn,
      duration_weeks: row.duration_weeks,
      capabilities: {
        has_power_backup: p.has_power_backup,
        has_training_laptops: p.has_training_laptops,
        has_internet: p.has_internet,
      },
      rank,
    })
  );

  return NextResponse.json({
    unlocked: true,
    locked: false,
    providers: unlockedProviders,
  });
}