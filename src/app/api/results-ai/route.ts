export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { AssessmentPayload, SkillRow } from "@/lib/rulesEngine";
import { runRecommendationPipeline } from "@/lib/rulesEngine";
import { buildFullReportsWithGemini } from "@/lib/recommendWithGeminiOrFallback";
import { FullResultsResponseSchema } from "@/lib/llmSchema";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ReqSchema = z.object({
  session_id: z.string().min(10),
  // optional: for debugging / admin
  force_refresh: z.boolean().optional(),
});

async function isSessionUnlocked(session_id: string) {
  const { data, error } = await supabase
    .from("sessions")
    .select("unlocked")
    .eq("session_id", session_id)
    .maybeSingle();

  if (error) return false;
  return Boolean(data?.unlocked);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { session_id, force_refresh } = ReqSchema.parse(body);

    const unlocked = await isSessionUnlocked(session_id);
    if (!unlocked) {
      return NextResponse.json({ message: "Still locked. Apply coupon to unlock." }, { status: 403 });
    }

    // 1) Load submission INCLUDING cache fields
    const { data: sub, error: subErr } = await supabase
      .from("assessment_submissions_v1")
      .select("state, city, area, answers, ai_results, ai_results_model, ai_results_created_at")
      .eq("session_id", session_id)
      .maybeSingle();

    if (subErr) return NextResponse.json({ message: subErr.message }, { status: 500 });
    if (!sub) return NextResponse.json({ message: "Submission not found." }, { status: 404 });

    // 2) If cached and not forcing refresh — return immediately (NO GEMINI COST)
    if (!force_refresh && sub.ai_results) {
      // Validate cached structure to avoid returning corrupt JSON
      const parsed = FullResultsResponseSchema.safeParse(sub.ai_results);
      if (parsed.success) {
        return NextResponse.json({
          session_id,
          unlocked: true,
          cached: true,
          model: sub.ai_results_model ?? null,
          created_at: sub.ai_results_created_at ?? null,
          recommendations: parsed.data.recommendations,
        });
      }
      // if cache is invalid, fall through to regenerate
    }

    // 3) Load skills for deterministic top 3 selection
    const { data: skillsData, error: skillsErr } = await supabase
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

    if (skillsErr) return NextResponse.json({ message: skillsErr.message }, { status: 500 });

    const skills = (skillsData as unknown as SkillRow[]) ?? [];

  const user: AssessmentPayload = {
  session_id,
  state: sub.state,
  city: sub.city,
  area: sub.area ?? undefined,
  ...(sub.answers as Record<string, unknown>),
} as unknown as AssessmentPayload;


    // deterministic scoring (Top 3)
    const recs = runRecommendationPipeline(user, skills);
    const top3 = recs.slice(0, 3);

    // 4) Generate full reports with Gemini (cost happens here)
    const fullReports = await buildFullReportsWithGemini(user, top3, skills);

    const aiResultsObject = {
      recommendations: fullReports,
    };

    // 5) Save cache back into assessment_submissions_v1
    const modelName = process.env.GEMINI_MODEL || "unknown";
    const now = new Date().toISOString();

    const { error: saveErr } = await supabase
      .from("assessment_submissions_v1")
      .update({
        ai_results: aiResultsObject,
        ai_results_model: modelName,
        ai_results_created_at: now,
      })
      .eq("session_id", session_id);

    if (saveErr) {
      // don’t fail the request just because caching failed
      console.error("Failed to cache ai_results:", saveErr.message);
    }

    return NextResponse.json({
      session_id,
      unlocked: true,
      cached: false,
      model: modelName,
      created_at: now,
      recommendations: fullReports,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
