import { z } from "zod";

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

// JSON Schema for Gemini "responseSchema"
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
