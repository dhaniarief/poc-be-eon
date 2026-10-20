import { createTool } from "@mastra/core/tools";

import {
  leMiningProductSearchInputSchema,
  leMiningProductSearchResultSchema,
} from "../../schemas/le-mining.schema.js";
import { searchLeMiningProducts } from "../../../services/microsoft/dynamics-crm/le-mining-product.service.js";
import { toTextModelOutput } from "../../runtime/model-output.js";

export const searchLeMiningProductsTool = createTool({
  id: "le-mining.products",

  description: `
Search the internal Dynamics CRM Product entity, but ONLY inside the fixed LE Mining scope.

The backend enforces all of these conditions:
- Product Family (new_productfamily) = 100000021 = Lubrication Engineers
- statecode = 0 = Active
- new_industryproduct contains Mining East (100000002) OR Mining West (100000003)

Use this tool to:
- verify whether a product is an active EON LE Mining product
- search by product name or product number
- find products whose CRM description matches a user need
- list products in the allowed LE Mining scope

Do not use this tool for Product Knowledge PDF content, success stories, SDS/MSDS, or external web research.
`.trim(),

  inputSchema: leMiningProductSearchInputSchema,
  outputSchema: leMiningProductSearchResultSchema,

  execute: async (input) =>
    searchLeMiningProducts({
      query: input.query,
      limit: input.limit,
    }),

  toModelOutput: (output) => toTextModelOutput("le-mining.products", output),
});
