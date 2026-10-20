import { z } from "zod";

export const knowledgeSearchInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(2)
    .max(2000)
    .describe(
      "Natural-language query for searching EON Product Knowledge documents by product, category, industry, application, equipment, success story, training material, or SDS/MSDS content.",
    ),

  topK: z.number().int().min(1).max(5).optional().default(5),
});

export const knowledgeSearchResultSchema = z.object({
  found: z.boolean(),
  query: z.string(),
  totalCandidates: z.number().int().nonnegative(),
  totalResults: z.number().int().nonnegative(),

  results: z.array(
    z.object({
      score: z.number(),
      semanticScore: z.number().optional(),
      lexicalScore: z.number().optional(),
      chunkIndex: z.number().int().nonnegative(),
      content: z.string(),
      title: z.string(),
      category: z.string().nullable(),
      productName: z.string().nullable(),
      industryTypes: z.array(z.string()),
      applications: z.array(z.string()),
      equipment: z.array(z.string()),
      sourceUrl: z.string().nullable(),
      sourceModifiedAt: z.string().nullable(),
    }),
  ),
});
