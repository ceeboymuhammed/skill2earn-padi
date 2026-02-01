// src/lib/rulesEngine.ts

export type UtilityReliability = "none" | "outages" | "stable";
export type EquipmentAccess = "none" | "smartphone_only" | "laptop_pc";

export type SeedCapitalBracket =
  | "below_50"
  | "50_100"
  | "100_200"
  | "200_400"
  | "above_400";

export type WorkspacePreference = "hands_on" | "desk" | "mix";
export type SocialBattery = "Introvert" | "Extrovert" | "Mix";
export type Mobility = "Remote" | "On-site" | "Hybrid";

export type ProblemInstinct = "Creative" | "Analytical" | "Adversarial";
export type MathLogicComfort = "Low" | "Moderate" | "High";
export type PatienceLevel = "Low" | "Moderate" | "High";

export type LearningStyle = "set_and_forget" | "continuous";
export type IncomeUrgency = "quick" | "long";

export type PrimaryInterest = "Build" | "Solve" | "Protect" | "Create" | "Connect";

export type AssessmentPayload = {
  session_id?: string;
  state: string;
  city: string;
  area?: string;

  equipment_access: EquipmentAccess;
  computer_proficiency?: number; // 1..5 (only if equipment_access = laptop_pc)
  seed_capital: SeedCapitalBracket;
  utility_reliability: UtilityReliability;

  workspace_preference: WorkspacePreference;
  social_battery: SocialBattery;
  mobility: Mobility;

  problem_instinct: ProblemInstinct;
  math_logic_comfort: MathLogicComfort;
  patience_level: PatienceLevel;
  learning_style: LearningStyle;

  income_urgency: IncomeUrgency;
  primary_interest: PrimaryInterest;
};

export type SkillRow = {
  skill_code: string;

  name: string;
  category: string;
  industry: string;

  min_budget_naira: number;
  max_budget_naira: number | null;

  power_need: "Low" | "Medium" | "High";
  internet_need: "Zero" | "Low" | "Medium" | "High";

  personality: "Introvert" | "Extrovert" | "Mix";
  prerequisite_proficiency: "Basic_Smartphone" | "Basic_Computer" | "Advanced_PC" | string;

  primary_goal: "Build" | "Create" | "Protect" | "Solve" | "Connect";
  mental_model: "Creative" | "Analytical" | "Structural";

  math_logic_intensity: "Low" | "Moderate" | "High";
  patience_level: "Low" | "Moderate" | "High";

  daily_activities: string | null;
  time_to_learn_months: number | null;
  time_to_earn_months: number | null;

  work_location: "Remote" | "On-site" | "Hybrid";
  portability: string;
  learning_curve: string;

  important_constraints: string | null;
};

export type Recommendation = {
  skill_code: string;
  skill_name: string;
  score: number; // 0..100
  reasons: string[];
  badges: string[];
  warnings: string[];
};

type Stage2Item = { skill: SkillRow; stage2Delta: number };

function budgetMaxFromBracket(b: SeedCapitalBracket): number {
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

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function prereqRank(x: SkillRow["prerequisite_proficiency"]): number {
  const v = (x || "").toLowerCase();
  if (v.includes("basic_smartphone")) return 0;
  if (v.includes("basic_computer")) return 1;
  if (v.includes("advanced_pc")) return 2;
  return 1;
}

function powerNeedRank(x: SkillRow["power_need"]): number {
  return x === "Low" ? 1 : x === "Medium" ? 2 : 3; // High=3
}

function internetNeedRank(x: SkillRow["internet_need"]): number {
  return x === "Zero" ? 0 : x === "Low" ? 1 : x === "Medium" ? 2 : 3;
}

function isDigitalish(skill: SkillRow): boolean {
  const prereq = (skill.prerequisite_proficiency || "").toLowerCase();
  if (prereq.includes("basic_computer") || prereq.includes("advanced_pc")) return true;

  const cat = (skill.category || "").toLowerCase();
  const ind = (skill.industry || "").toLowerCase();
  const keywords = [
    "digital",
    "tech",
    "data",
    "software",
    "program",
    "design",
    "ui",
    "ux",
    "analytics",
    "cyber",
    "network",
  ];
  return keywords.some((k) => cat.includes(k) || ind.includes(k));
}

// Stage 3 factor scoring helpers (0..1)
function scorePersonality(user: SocialBattery, skill: SkillRow["personality"]): number {
  if (user === skill) return 1;
  if (user === "Mix" || skill === "Mix") return 0.7;
  return 0.2;
}

function scoreMentalModel(user: ProblemInstinct, skill: SkillRow["mental_model"]): number {
  if (user === skill) return 1;
  if (user === "Analytical" && skill === "Structural") return 0.7;
  if (user === "Adversarial" && skill === "Structural") return 0.7;
  if (user === "Adversarial" && skill === "Analytical") return 0.4;
  if (user === "Creative" && (skill === "Analytical" || skill === "Structural")) return 0.3;
  return 0.2;
}

function scoreInterest(user: PrimaryInterest, skill: SkillRow["primary_goal"]): number {
  if (user === skill) return 1;
  if (user === "Build" && skill === "Solve") return 0.6;
  if (user === "Solve" && skill === "Build") return 0.6;
  if (user === "Protect" && skill === "Solve") return 0.5;
  if (user === "Create" && skill === "Connect") return 0.5;
  if (user === "Connect" && skill === "Create") return 0.5;
  return 0.2;
}

function scorePatience(user: PatienceLevel, skill: SkillRow["patience_level"]): number {
  if (user === skill) return 1;
  if ((user === "Low" && skill === "Moderate") || (user === "Moderate" && skill === "Low")) return 0.6;
  if ((user === "High" && skill === "Moderate") || (user === "Moderate" && skill === "High")) return 0.6;
  return 0.2;
}

export function runRecommendationPipeline(user: AssessmentPayload, skills: SkillRow[]): Recommendation[] {
  const budgetMax = budgetMaxFromBracket(user.seed_capital);

  // ---------- Stage 1: Hard Filter ----------
  const stage1Shortlist: SkillRow[] = skills.filter((s) => {
    // Tool check
    if (user.equipment_access === "none" || user.equipment_access === "smartphone_only") {
      if (prereqRank(s.prerequisite_proficiency) >= 1) return false;
    }

    // Budget check
    if (budgetMax < s.min_budget_naira) return false;

    return true;
  });

  // Fallback if everything was filtered out
  if (stage1Shortlist.length === 0) {
    return skills
      .slice()
      .sort((a, b) => a.min_budget_naira - b.min_budget_naira)
      .slice(0, 3)
      .map((s) => ({
        skill_code: s.skill_code,
        skill_name: s.name,
        score: 1,
        reasons: [
          "Your constraints remove most options right now.",
          "This is one of the lowest-cost options in the dataset. Consider increasing budget or improving tools access.",
        ],
        badges: [],
        warnings: ["Most skills were filtered out based on tools/budget."],
      }));
  }

  // ---------- Stage 2: Infrastructure Validation (penalties/boosts) ----------
  const stage2List: Stage2Item[] = stage1Shortlist
    .map((skill) => {
      let stage2Delta = 0;

      const pRank = powerNeedRank(skill.power_need);
      const iRank = internetNeedRank(skill.internet_need);

      // Utility reliability adjustments
      if (user.utility_reliability === "none") {
        if (pRank >= 2) stage2Delta -= 15;
        if (iRank >= 2) stage2Delta -= 15;
      } else if (user.utility_reliability === "outages") {
        if (pRank === 3) stage2Delta -= 10;
        if (iRank === 3) stage2Delta -= 10;
      }

      // Mobility match
      if (user.mobility === "Remote") {
        if (skill.work_location === "Remote") stage2Delta += 8;
        else if (skill.work_location === "Hybrid") stage2Delta += 4;
        else stage2Delta -= 10;
      } else if (user.mobility === "On-site") {
        if (skill.work_location === "On-site") stage2Delta += 6;
      } else if (user.mobility === "Hybrid") {
        if (skill.work_location === "Hybrid") stage2Delta += 6;
      }

      // Workspace preference heuristic
      const digital = isDigitalish(skill);
      if (user.workspace_preference === "desk" && digital) stage2Delta += 4;
      if (user.workspace_preference === "hands_on" && !digital) stage2Delta += 4;
      if (user.workspace_preference === "desk" && !digital) stage2Delta -= 2;
      if (user.workspace_preference === "hands_on" && digital) stage2Delta -= 2;

      return { skill, stage2Delta };
    })
    // only hard-remove the most impossible when utility is "none" AND both needs are maxed
    .filter(({ skill }) => {
      if (user.utility_reliability !== "none") return true;
      const pRank = powerNeedRank(skill.power_need);
      const iRank = internetNeedRank(skill.internet_need);
      return !(pRank === 3 && iRank === 3);
    });

  // ---------- Stage 3: Psychometric Scoring ----------
  const scored = stage2List.map(({ skill, stage2Delta }) => {
    const P = scorePersonality(user.social_battery, skill.personality);
    const M = scoreMentalModel(user.problem_instinct, skill.mental_model);
    const I = scoreInterest(user.primary_interest, skill.primary_goal);
    const Pa = scorePatience(user.patience_level, skill.patience_level);

    const base = 0.3 * P + 0.3 * M + 0.2 * I + 0.2 * Pa; // 0..1
    let score = Math.round(clamp01(base) * 100);

    score = Math.max(0, Math.min(100, score + stage2Delta));

    const reasons: string[] = [];

    // strong matches
    if (P >= 0.9) reasons.push("Matches your social work style (introvert/extrovert mix).");
    if (M >= 0.9) reasons.push("Matches how you naturally solve problems.");
    if (I >= 0.9) reasons.push("Matches what you find most interesting.");
    if (Pa >= 0.9) reasons.push("Matches your patience level for learning.");

    // Always include feasibility reason
    reasons.push(`Fits within your seed capital (min ₦${skill.min_budget_naira.toLocaleString()}).`);

    // Environment note
    if (user.utility_reliability !== "stable") {
      reasons.push("Your utility reliability was considered in this recommendation.");
    }

    return { skill, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);

  // ---------- Stage 4: Advisory Layer ----------
  const out: Recommendation[] = scored.slice(0, 5).map(({ skill, score, reasons }) => {
    const badges: string[] = [];
    const warnings: string[] = [];

    const hasLaptop = user.equipment_access === "laptop_pc";
    const pc = user.computer_proficiency ?? null;

    // Computer Fundamentals badge
    if (hasLaptop && pc !== null && pc <= 2 && isDigitalish(skill)) {
      badges.push("Start with Computer Fundamentals first");
    }

    // Urgency mismatch warning
    if (user.income_urgency === "quick") {
      const tEarn = skill.time_to_earn_months ?? null;
      if (tEarn !== null && tEarn > 3) {
        warnings.push("This is a strong long-term match, but it may take longer than 3 months to start earning.");
      }
    }

    return {
      skill_code: skill.skill_code,
      skill_name: skill.name,
      score,
      reasons,
      badges,
      warnings,
    };
  });

  // Add “backup skill” suggestion to top recommendation if urgency mismatch
  if (user.income_urgency === "quick" && out.length >= 2) {
    const topSkillCode = out[0].skill_code;
    const topSkill = scored.find((x) => x.skill.skill_code === topSkillCode)?.skill;
    if (topSkill?.time_to_earn_months && topSkill.time_to_earn_months > 3) {
      out[0].warnings.push(
        `Consider also: ${out[1].skill_name} as a faster-earning backup while you build your top skill.`
      );
    }
  }

  return out;
}
