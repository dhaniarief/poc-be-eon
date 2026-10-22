import { createTool } from "@mastra/core/tools";

import {
  lePublicWebSearchInputSchema,
  lePublicWebSearchResultSchema,
} from "../../schemas/le-mining.schema.js";
import { searchLePublicWeb } from "../../../services/web/le-public-search.service.js";
import { toTextModelOutput } from "../../runtime/model-output.js";

export const searchLePublicWebTool = createTool({
  id: "le-mining.web",

  description: `
Search public LE PRODUCT information only.

This tool is restricted in code to:
- eonchemicals.com
- lelubricants.com
- lubetechnologies.com

Use for:
- current/public LE product information
- public product pages
- public product specifications or product-family information
- product information not available in CRM or Product Knowledge

Do NOT use this tool for general company, customer, person, stakeholder, project, mining-market, or news research. Those requests use searchPublicIntelligence.
`.trim(),

  inputSchema: lePublicWebSearchInputSchema,
  outputSchema: lePublicWebSearchResultSchema,

  execute: async ({ query }) => searchLePublicWeb(query),

  toModelOutput: (output) => toTextModelOutput("le-mining.web", output),
});
