export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { randomUUID } from "crypto";

import {
  runRecommendationPipeline,
  type SkillRow,
  type Recommendation,
  type AssessmentPayload,
} from "@/lib/rulesEngine";

import { recommendWithGeminiOrFallback } from "@/lib/recommendWithGeminiOrFallback";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "").trim();
}

function isValidPhone(phone: string) {
  const p = normalizePhone(phone);
  const digits = p.startsWith("+") ? p.slice(1) : p;
  return /^\d{10,15}$/.test(digits);
}

/**
 * Assessment payload from the assessment page.
 * Contact fields optional because preview page collects them now.
 */
const Schema = z.object({
  session_id: z.string().optional(),

  full_name: z.string().optional().default(""),
  email: z.string().email("email is invalid").optional().default(""),
  phone: z.string().optional().default(""),

  state: z.string().min(1),
  city: z.string().min(1),
  area: z.string().optional(),

  equipment_access: z.enum(["none", "smartphone_only", "laptop_pc"]),
  computer_proficiency: z.coerce.number().int().min(1).max(10).optional(),

  seed_capital: z.enum(["below_50", "50_100", "100_200", "200_400", "above_400"]),
  utility_reliability: z.enum(["none", "outages", "stable"]),

  workspace_preference: z.enum(["hands_on", "desk", "mix"]),
  social_battery: z.enum(["Introvert", "Extrovert", "Mix"]),
  mobility: z.enum(["Remote", "On-site", "Hybrid"]),

  problem_instinct: z.enum(["Creative", "Analytical", "Adversarial"]),
  math_logic_comfort: z.enum(["Low", "Moderate", "High"]),
  patience_level: z.enum(["Low", "Moderate", "High"]),
  learning_style: z.enum(["set_and_forget", "continuous"]),

  income_urgency: z.enum(["quick", "long"]),
  primary_interest: z.enum(["Build", "Solve", "Protect", "Create", "Connect"]),

  mode: z.enum(["preview", "full"]).optional(),
});

type RecommendInput = z.infer<typeof Schema>;

async function isSessionUnlocked(sessionId?: string): Promise<boolean> {
  if (!sessionId) return false;

  const { data, error } = await supabase
    .from("sessions")
    .select("unlocked")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) return false;
  return Boolean(data?.unlocked);
}

function normalizeProficiencyTo5(v?: number) {
  if (v == null || !Number.isFinite(v)) return null;
  const scaled = Math.round(v / 2);
  return Math.max(1, Math.min(5, scaled));
}

function shouldUseAI(): boolean {
  return (process.env.USE_AI_RECOMMENDER || "").toLowerCase() === "true";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const user: RecommendInput = Schema.parse(body);

    const session_id =
      user.session_id ?? `s2e_${randomUUID().replace(/-/g, "")}_${Date.now()}`;

    const prof5 = normalizeProficiencyTo5(user.computer_proficiency);

    if (user.equipment_access === "laptop_pc" && prof5 == null) {
      return NextResponse.json(
        { message: "computer_proficiency is required when equipment_access is laptop_pc" },
        { status: 400 }
      );
    }

    const email = user.email?.trim().toLowerCase() || "";
    const phoneRaw = user.phone?.trim() || "";
    const phone = phoneRaw ? normalizePhone(phoneRaw) : "";

    if (phone && !isValidPhone(phone)) {
      return NextResponse.json({ message: "phone is invalid" }, { status: 400 });
    }

    const requestedMode = user.mode ?? "preview";
    const unlocked = await isSessionUnlocked(session_id);

    // ✅ NEW FLOW FIX:
    // Always honor requested mode (preview page collects user details; full must be available)
    const mode = requestedMode;

    const { data, error } = await supabase
      .from("skills_v1")
      .select(
        [
          "skill_code",
          "name",
          "category",
          "industry",
          "min_budget_naira",
          "max_budget_naira",
          "power_need",
          "internet_need",
          "personality",
          "prerequisite_proficiency",
          "primary_goal",
          "mental_model",
          "math_logic_intensity",
          "patience_level",
          "daily_activities",
          "time_to_learn_months",
          "time_to_earn_months",
          "work_location",
          "portability",
          "learning_curve",
          "important_constraints",
        ].join(",")
      );

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });

    const skills = (data as unknown as SkillRow[]) ?? [];

    const payload: AssessmentPayload = {
      session_id,
      state: user.state,
      city: user.city,
      area: user.area,

      equipment_access: user.equipment_access,
      computer_proficiency: user.equipment_access === "laptop_pc" ? (prof5 ?? undefined) : undefined,
      seed_capital: user.seed_capital,
      utility_reliability: user.utility_reliability,

      workspace_preference: user.workspace_preference,
      social_battery: user.social_battery,
      mobility: user.mobility,

      problem_instinct: user.problem_instinct,
      math_logic_comfort: user.math_logic_comfort,
      patience_level: user.patience_level,
      learning_style: user.learning_style,

      income_urgency: user.income_urgency,
      primary_interest: user.primary_interest,
    };

    const recommendations: Recommendation[] = shouldUseAI()
      ? await recommendWithGeminiOrFallback(payload, skills)
      : runRecommendationPipeline(payload, skills);

    const preview =
      mode === "preview"
        ? recommendations.slice(0, 3).map((r) => ({
            skill_code: r.skill_code,
            skill_name: r.skill_name,
            score: r.score,
            teaser: r.reasons.slice(0, 2),
          }))
        : null;

    const { error: saveErr } = await supabase
      .from("assessment_submissions_v1")
      .upsert(
        {
          session_id,

          full_name: user.full_name?.trim() || null,
          email: email || null,
          phone: phone || null,

          state: user.state.trim(),
          city: user.city.trim(),
          area: user.area?.trim() || null,

          mode,
          unlocked,

          answers: {
            equipment_access: user.equipment_access,
            computer_proficiency: user.equipment_access === "laptop_pc" ? prof5 : null,
            seed_capital: user.seed_capital,
            utility_reliability: user.utility_reliability,
            workspace_preference: user.workspace_preference,
            social_battery: user.social_battery,
            mobility: user.mobility,
            problem_instinct: user.problem_instinct,
            math_logic_comfort: user.math_logic_comfort,
            patience_level: user.patience_level,
            learning_style: user.learning_style,
            income_urgency: user.income_urgency,
            primary_interest: user.primary_interest,
          },

          preview,
          recommendations: mode === "full" ? recommendations : null,
        },
        { onConflict: "session_id" }
      );

    if (saveErr) console.error("Failed to save submission:", saveErr.message);

    if (mode === "preview") {
      return NextResponse.json({
        session_id,
        unlocked,
        mode: "preview",
        recommendations: preview,
      });
    }

    return NextResponse.json({
      session_id,
      unlocked,
      mode: "full",
      recommendations,
    });
  } catch (e: unknown) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(e.issues, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
