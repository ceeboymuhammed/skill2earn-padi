import type { SkillRow, Recommendation, AssessmentPayload } from "@/lib/rulesEngine";
import { runRecommendationPipeline } from "@/lib/rulesEngine";
import { getGeminiClient, getGeminiModel } from "@/lib/geminiClient";
import {
  LLMRecommendationResponseSchema,
  llmResponseJsonSchema,
  type LLMRecommendationResponse,
} from "@/lib/llmSchema";

type Stage2Item = { skill: SkillRow; stage2Delta: number };

function budgetMaxFromBracket(b: AssessmentPayload["seed_capital"]): number {
  switch (b) {
    case "below_50":
      return 49_999;
    case "50_100":
      return 100_000;
    case "100_200":
      return 200_000;
    case "200_400":
      return 400_000;
    case "above_400":
      return 999_999_999;
  }
}

function prereqRank(x: SkillRow["prerequisite_proficiency"]): number {
  const v = (x || "").toLowerCase();
  if (v.includes("basic_smartphone")) return 0;
  if (v.includes("basic_computer")) return 1;
  if (v.includes("advanced_pc")) return 2;
  return 1;
}

function powerNeedRank(x: SkillRow["power_need"]): number {
  return x === "Low" ? 1 : x === "Medium" ? 2 : 3;
}

function internetNeedRank(x: SkillRow["internet_need"]): number {
  return x === "Zero" ? 0 : x === "Low" ? 1 : x === "Medium" ? 2 : 3;
}

function isDigitalish(skill: SkillRow): boolean {
  const prereq = (skill.prerequisite_proficiency || "").toLowerCase();
  if (prereq.includes("basic_computer") || prereq.includes("advanced_pc")) return true;

  const cat = (skill.category || "").toLowerCase();
  const ind = (skill.industry || "").toLowerCase();
  const keywords = ["digital", "tech", "data", "software", "program", "design", "ui", "ux", "analytics", "cyber", "network"];
  return keywords.some((k) => cat.includes(k) || ind.includes(k));
}

// Stage 1 + Stage 2 shortlist + deltas (deterministic)
function shortlistWithDeltas(user: AssessmentPayload, skills: SkillRow[]) {
  const budgetMax = budgetMaxFromBracket(user.seed_capital);

  const stage1 = skills.filter((s) => {
    // tool check
    if (user.equipment_access === "none" || user.equipment_access === "smartphone_only") {
      if (prereqRank(s.prerequisite_proficiency) >= 1) return false;
    }

    // budget check
    if (budgetMax < s.min_budget_naira) return false;

    return true;
  });

  // fallback shortlist if empty
  const stage1Shortlist =
    stage1.length > 0
      ? stage1
      : skills.slice().sort((a, b) => a.min_budget_naira - b.min_budget_naira).slice(0, 25);

  const stage2: Stage2Item[] = stage1Shortlist
    .map((skill) => {
      let stage2Delta = 0;

      const pRank = powerNeedRank(skill.power_need);
      const iRank = internetNeedRank(skill.internet_need);

      // utility reliability penalties
      if (user.utility_reliability === "none") {
        if (pRank >= 2) stage2Delta -= 15;
        if (iRank >= 2) stage2Delta -= 15;
      } else if (user.utility_reliability === "outages") {
        if (pRank === 3) stage2Delta -= 10;
        if (iRank === 3) stage2Delta -= 10;
      }

      // mobility match
      if (user.mobility === "Remote") {
        if (skill.work_location === "Remote") stage2Delta += 8;
        else if (skill.work_location === "Hybrid") stage2Delta += 4;
        else stage2Delta -= 10;
      } else if (user.mobility === "On-site") {
        if (skill.work_location === "On-site") stage2Delta += 6;
      } else if (user.mobility === "Hybrid") {
        if (skill.work_location === "Hybrid") stage2Delta += 6;
      }

      // workspace preference heuristic
      const digital = isDigitalish(skill);
      if (user.workspace_preference === "desk" && digital) stage2Delta += 4;
      if (user.workspace_preference === "hands_on" && !digital) stage2Delta += 4;
      if (user.workspace_preference === "desk" && !digital) stage2Delta -= 2;
      if (user.workspace_preference === "hands_on" && digital) stage2Delta -= 2;

      return { skill, stage2Delta };
    })
    // when utility is "none", hard-remove max-demand skills
    .filter(({ skill }) => {
      if (user.utility_reliability !== "none") return true;
      const pRank = powerNeedRank(skill.power_need);
      const iRank = internetNeedRank(skill.internet_need);
      return !(pRank === 3 && iRank === 3);
    });

  const stage2Deltas: Record<string, number> = {};
  for (const x of stage2) stage2Deltas[x.skill.skill_code] = x.stage2Delta;

  // limit size to control token cost
  const shortlistSkills = stage2
    .slice()
    .sort((a, b) => b.stage2Delta - a.stage2Delta)
    .slice(0, 35)
    .map((x) => x.skill);

  return { shortlistSkills, stage2Deltas };
}

function buildInstruction() {
  return `
You are a recommendation engine. Return ONLY valid JSON matching the provided schema.
No markdown. No extra keys.

Hard rules:
- You MUST only recommend skill_code values that exist in shortlistSkills.
- Provide 1..5 recommendations.
- score must be an integer 0..100.
- reasons: 3..6 short bullets grounded in userAssessment + skill fields.
- badges/warnings must be arrays (can be empty).

Logic rules:
- Use stage2Deltas: higher delta means better feasibility.
- If income_urgency == "quick", prefer skills with time_to_earn_months <= 3 when similar.
- Add warnings when utility_reliability conflicts with power/internet needs, or quick-income mismatch (time_to_earn_months > 3).
- If equipment_access == "laptop_pc" and computer_proficiency <= 2 and skill is digital-ish, add badge "Start with Computer Fundamentals first".
`.trim();
}

export async function recommendWithGeminiOrFallback(
  user: AssessmentPayload,
  skills: SkillRow[]
): Promise<Recommendation[]> {
  const { shortlistSkills, stage2Deltas } = shortlistWithDeltas(user, skills);

  // If shortlist is empty for any reason, just fallback
  if (shortlistSkills.length === 0) {
    return runRecommendationPipeline(user, skills);
  }

  const input = {
    userAssessment: user,
    shortlistSkills,
    stage2Deltas,
    constraints: { maxRecommendations: 5, mustUseSkillCodesProvided: true },
  };

  try {
    const ai = getGeminiClient();
    const model = getGeminiModel();

    const resp = await ai.models.generateContent({
      model,
      contents: [
        { role: "user", parts: [{ text: buildInstruction() }] },
        { role: "user", parts: [{ text: JSON.stringify(input) }] },
      ],
      config: {
        temperature: 0.3,
        responseMimeType: "application/json",
        responseSchema: llmResponseJsonSchema(),
      },
    });

    // ✅ Fix: Gemini can return undefined text, so guard it
    const text = resp.text ?? "";
    if (!text) throw new Error("Gemini returned empty text");

    const parsed = JSON.parse(text) as unknown;
    const validated: LLMRecommendationResponse = LLMRecommendationResponseSchema.parse(parsed);

    // Map skill_code -> skill locally
    const byCode = new Map(shortlistSkills.map((s) => [s.skill_code, s]));
    const allowed = new Set(shortlistSkills.map((s) => s.skill_code));

    const out: Recommendation[] = validated.recommendations
      .filter((r) => allowed.has(r.skill_code))
      .map((r) => ({
        skill_code: r.skill_code,
        skill_name: byCode.get(r.skill_code)?.name ?? r.skill_code,
        score: r.score,
        reasons: r.reasons,
        badges: r.badges,
        warnings: r.warnings,
      }))
      .slice(0, 5);

    if (out.length === 0) return runRecommendationPipeline(user, skills);
    return out;
  } catch {
    return runRecommendationPipeline(user, skills);
  }
}
