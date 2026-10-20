import { createTool } from "@mastra/core/tools";

import {
  lePublicIntelligenceSearchInputSchema,
  lePublicIntelligenceSearchResultSchema,
} from "../../schemas/le-mining.schema.js";
import { searchLePublicIntelligence } from "../../../services/web/le-public-intelligence.service.js";
import { toTextModelOutput } from "../../runtime/model-output.js";

export const searchLePublicIntelligenceTool = createTool({
  id: "le-mining.public-intelligence",

  description: `
Search the public web for non-product LE Mining intelligence.

Use for:
- public company/customer research
- public professional/stakeholder research
- mining projects, sites, operations, market information, and current news
- external evidence that is not available in CRM or Product Knowledge

Do NOT use this tool for LE product specifications, product recommendation, product availability, product documents, or product research. Product web research must use searchLeProductWeb, which is restricted to eonchemicals.com and lelubricants.com.

Public professional information is evidence only. Do not label a person as a confirmed decision maker unless internal CRM/opportunity evidence confirms it.
`.trim(),

  inputSchema: lePublicIntelligenceSearchInputSchema,
  outputSchema: lePublicIntelligenceSearchResultSchema,

  execute: async ({ query }) => searchLePublicIntelligence(query),

  toModelOutput: (output) =>
    toTextModelOutput("le-mining.public-intelligence", output),
});
