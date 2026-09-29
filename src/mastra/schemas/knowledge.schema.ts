import { z } from "zod";

export const knowledgeSearchInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(2)
    .max(2000)
    .describe(
      "Natural-language query for searching EON internal SOP and IK knowledge.",
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

      // WAJIB
      content: z.string(),

      title: z.string(),
      docNumber: z.string().nullable(),
      docType: z.string().nullable(),
      process: z.string().nullable(),
      docVersion: z.number().nullable(),
      sourceUrl: z.string().nullable(),
      sourceModifiedAt: z.string().nullable(),
    }),
  ),
});
