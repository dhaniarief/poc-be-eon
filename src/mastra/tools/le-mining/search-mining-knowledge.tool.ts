import { createTool } from "@mastra/core/tools";

import { knowledgeSearchResultSchema } from "../../schemas/knowledge.schema.js";
import { leMiningKnowledgeSearchInputSchema } from "../../schemas/le-mining.schema.js";
import { searchKnowledge } from "../../../services/rag/knowledge-search.service.js";
import { knowledgeResultToModelOutput } from "../knowledge/search-knowledge.tool.js";

const MINING_PRODUCT_KNOWLEDGE_INDUSTRIES = [
  "Mining Contractor",
  "Mining Owner",
] as const;

export const searchLeMiningKnowledgeTool = createTool({
  id: "le-mining.knowledge",

  description: `
Search ONLY EON SharePoint Product Knowledge documents for Mining.

The backend always restricts results to Product Knowledge documents whose Industry Type contains at least one of:
- Mining Contractor
- Mining Owner

Use for:
- product information and technical data
- application / equipment recommendations
- success stories and customer testimonials
- Product Data Sheet / Technical Datasheet
- MSDS / SDS stored in Product Knowledge
- training material
- product references for Mining

The tool does not search SOP/IK and cannot access MIS-SOPIK.
`.trim(),

  inputSchema: leMiningKnowledgeSearchInputSchema,
  outputSchema: knowledgeSearchResultSchema,

  execute: async (input) =>
    searchKnowledge({
      query: input.query,
      topK: input.topK,
      industryTypes: [...MINING_PRODUCT_KNOWLEDGE_INDUSTRIES],
    }),

  toModelOutput: knowledgeResultToModelOutput,
});
