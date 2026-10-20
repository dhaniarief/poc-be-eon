import { createTool } from "@mastra/core/tools";

import {
  leMiningCustomerSearchInputSchema,
  leMiningCustomerSearchResultSchema,
} from "../../schemas/le-mining.schema.js";
import { searchLeMiningCustomers } from "../../../services/microsoft/dynamics-crm/le-mining-intelligence.service.js";
import { toTextModelOutput } from "../../runtime/model-output.js";

export const searchLeMiningCustomersTool = createTool({
  id: "le-mining.customers",

  description: `
Search internal Dynamics CRM Account/customer records by customer name or account number.

Use for:
- checking whether a company/customer exists in EON CRM
- retrieving standard customer profile fields such as name, website, phone, city, country, and CRM industry label when available
- resolving a customer before searching CRM contacts for that company

Important:
- this tool does NOT hard-filter customers to Mining because the authoritative CRM Account mining-classification field has not been defined for this agent;
- do not claim that a customer is a Mining customer unless CRM evidence or public evidence actually supports it;
- do not use this tool for product recommendation.
`.trim(),

  inputSchema: leMiningCustomerSearchInputSchema,
  outputSchema: leMiningCustomerSearchResultSchema,

  execute: async (input) =>
    searchLeMiningCustomers({
      query: input.query,
      limit: input.limit,
      activeOnly: input.activeOnly,
    }),

  toModelOutput: (output) => toTextModelOutput("le-mining.customers", output),
});
