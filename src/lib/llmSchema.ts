import { z } from "zod";

/**
 * 1) Gemini output for "picking skills" (1..5)
 */
export const LLMRecommendationResponseSchema = z.object({
  recommendations: z
    .array(
      z.object({
        skill_code: z.string().min(1),
        score: z.number().int().min(0).max(100),
        reasons: z.array(z.string().min(1)).min(3).max(6),
        badges: z.array(z.string()).max(5),
        warnings: z.array(z.string()).max(5),
      })
    )
    .min(1)
    .max(5),
  meta: z.object({
    model: z.string(),
    version: z.string(),
  }),
});

export type LLMRecommendationResponse = z.infer<typeof LLMRecommendationResponseSchema>;

/**
 * JSON Schema for Gemini "responseSchema" (picking skills)
 */
export function llmResponseJsonSchema() {
  return {
    type: "object",
    properties: {
      recommendations: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            skill_code: { type: "string" },
            score: { type: "integer", minimum: 0, maximum: 100 },
            reasons: {
              type: "array",
              minItems: 3,
              maxItems: 6,
              items: { type: "string" },
            },
            badges: { type: "array", items: { type: "string" }, maxItems: 5 },
            warnings: { type: "array", items: { type: "string" }, maxItems: 5 },
          },
          required: ["skill_code", "score", "reasons", "badges", "warnings"],
        },
      },
      meta: {
        type: "object",
        properties: {
          model: { type: "string" },
          version: { type: "string" },
        },
        required: ["model", "version"],
      },
    },
    required: ["recommendations", "meta"],
  };
}

/**
 * 2) Gemini output for "FULL results" (Top 3 detailed reports)
 */
export const FullSkillReportSchema = z.object({
  skill_code: z.string(),
  skill_name: z.string(),

  match_score: z.number().int().min(0).max(100),
  logic_summary: z.string(),
  strengths_alignment: z.array(z.string()).min(2).max(6),

  cost_of_entry: z.object({
    tool_checklist: z.array(z.string()).min(3).max(12),
    startup_cost_breakdown: z.object({
      training_fees_naira: z.number().int().nonnegative(),
      tools_naira: z.number().int().nonnegative(),
      data_power_naira: z.number().int().nonnegative(),
      total_estimated_naira: z.number().int().nonnegative(),
    }),
    maintenance_needs: z.array(z.string()).min(2).max(8),
  }),

  timeline: z.object({
    time_to_junior_months: z.number().int().nonnegative(),
    first_paycheck_months: z.number().int().nonnegative(),
    prerequisites: z.array(z.string()).min(1).max(8),
  }),

  market_insights: z.object({
    demand_level: z.enum(["Hot", "Steady", "Slow"]),
    income_potential_naira: z.object({
      entry_level_monthly: z.string(),
      professional_monthly: z.string(),
    }),
    top_industries: z.array(z.string()).min(2).max(10),
  }),

  vibe_check: z.object({
    day_in_the_life: z.array(z.string()).min(3).max(6),
    work_mode: z.enum(["Remote", "On-site", "Hybrid"]),
    physical_demand: z.enum(["Desk job", "Field work", "Mix"]),
  }),

  next_steps: z.object({
    steps: z.array(z.string()).min(3).max(8),
    training_centre_note: z.string(),
  }),
});

export const FullResultsResponseSchema = z.object({
  recommendations: z.array(FullSkillReportSchema).length(3),
});

export type FullSkillReport = z.infer<typeof FullSkillReportSchema>;
export type FullResultsResponse = z.infer<typeof FullResultsResponseSchema>;

/**
 * JSON Schema for Gemini "responseSchema" (FULL results Top 3)
 */
export function fullResultsJsonSchema() {
  return {
    type: "object",
    properties: {
      recommendations: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            skill_code: { type: "string" },
            skill_name: { type: "string" },

            match_score: { type: "integer", minimum: 0, maximum: 100 },
            logic_summary: { type: "string" },
            strengths_alignment: {
              type: "array",
              minItems: 2,
              maxItems: 6,
              items: { type: "string" },
            },

            cost_of_entry: {
              type: "object",
              properties: {
                tool_checklist: { type: "array", minItems: 3, maxItems: 12, items: { type: "string" } },
                startup_cost_breakdown: {
                  type: "object",
                  properties: {
                    training_fees_naira: { type: "integer", minimum: 0 },
                    tools_naira: { type: "integer", minimum: 0 },
                    data_power_naira: { type: "integer", minimum: 0 },
                    total_estimated_naira: { type: "integer", minimum: 0 },
                  },
                  required: ["training_fees_naira", "tools_naira", "data_power_naira", "total_estimated_naira"],
                },
                maintenance_needs: { type: "array", minItems: 2, maxItems: 8, items: { type: "string" } },
              },
              required: ["tool_checklist", "startup_cost_breakdown", "maintenance_needs"],
            },

            timeline: {
              type: "object",
              properties: {
                time_to_junior_months: { type: "integer", minimum: 0 },
                first_paycheck_months: { type: "integer", minimum: 0 },
                prerequisites: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
              },
              required: ["time_to_junior_months", "first_paycheck_months", "prerequisites"],
            },

            market_insights: {
              type: "object",
              properties: {
                demand_level: { type: "string", enum: ["Hot", "Steady", "Slow"] },
                income_potential_naira: {
                  type: "object",
                  properties: {
                    entry_level_monthly: { type: "string" },
                    professional_monthly: { type: "string" },
                  },
                  required: ["entry_level_monthly", "professional_monthly"],
                },
                top_industries: { type: "array", minItems: 2, maxItems: 10, items: { type: "string" } },
              },
              required: ["demand_level", "income_potential_naira", "top_industries"],
            },

            vibe_check: {
              type: "object",
              properties: {
                day_in_the_life: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" } },
                work_mode: { type: "string", enum: ["Remote", "On-site", "Hybrid"] },
                physical_demand: { type: "string", enum: ["Desk job", "Field work", "Mix"] },
              },
              required: ["day_in_the_life", "work_mode", "physical_demand"],
            },

            next_steps: {
              type: "object",
              properties: {
                steps: { type: "array", minItems: 3, maxItems: 8, items: { type: "string" } },
                training_centre_note: { type: "string" },
              },
              required: ["steps", "training_centre_note"],
            },
          },
          required: [
            "skill_code",
            "skill_name",
            "match_score",
            "logic_summary",
            "strengths_alignment",
            "cost_of_entry",
            "timeline",
            "market_insights",
            "vibe_check",
            "next_steps",
          ],
        },
      },
    },
    required: ["recommendations"],
  };
}
