import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { runRecommendationPipeline, SkillRow } from "@/lib/rulesEngine";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const Schema = z.object({
  session_id: z.string().optional(),

  state: z.string().min(1),
  city: z.string().min(1),
  area: z.string().optional(),

  equipment_access: z.enum(["none", "smartphone_only", "laptop_pc"]),
  computer_proficiency: z.number().int().min(1).max(5).optional(),

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const user = Schema.parse(body);

    // conditional validation
    if (user.equipment_access === "laptop_pc" && user.computer_proficiency == null) {
      return NextResponse.json(
        { message: "computer_proficiency is required when equipment_access is laptop_pc" },
        { status: 400 }
      );
    }

    const requestedMode = user.mode ?? "preview";
    const unlocked = await isSessionUnlocked(user.session_id);
    const mode = unlocked && requestedMode === "full" ? "full" : "preview";

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

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    const skills = (data as unknown as SkillRow[]) ?? [];

    const recommendations = runRecommendationPipeline(user, skills);

    if (mode === "preview") {
      const preview = recommendations.slice(0, 3).map((r) => ({
        skill_code: r.skill_code,
        skill_name: r.skill_name,
        score: r.score,
        teaser: r.reasons.slice(0, 2),
      }));

      return NextResponse.json({
        session_id: user.session_id ?? null,
        unlocked,
        mode: "preview",
        recommendations: preview,
      });
    }

    return NextResponse.json({
      session_id: user.session_id ?? null,
      unlocked,
      mode: "full",
      recommendations,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
