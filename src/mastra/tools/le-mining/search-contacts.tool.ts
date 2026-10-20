import { createTool } from "@mastra/core/tools";

import {
  leMiningContactSearchInputSchema,
  leMiningContactSearchResultSchema,
} from "../../schemas/le-mining.schema.js";
import { searchLeMiningContacts } from "../../../services/microsoft/dynamics-crm/le-mining-intelligence.service.js";
import { toTextModelOutput } from "../../runtime/model-output.js";

export const searchLeMiningContactsTool = createTool({
  id: "le-mining.contacts",

  description: `
Search internal Dynamics CRM Contact records.

Use for:
- finding a person/contact by name, email, or job title
- listing contacts under a resolved CRM customer using customerId
- internal business-contact lookup

Recommended flow when the user asks for people at a company:
1. call searchLeMiningCustomers to resolve the company;
2. use the returned accountId as customerId here.

A CRM Contact is an internal business contact, but it is NOT automatically a confirmed decision maker for a specific opportunity.
`.trim(),

  inputSchema: leMiningContactSearchInputSchema,
  outputSchema: leMiningContactSearchResultSchema,

  execute: async (input) =>
    searchLeMiningContacts({
      query: input.query,
      customerId: input.customerId,
      limit: input.limit,
      activeOnly: input.activeOnly,
    }),

  toModelOutput: (output) => toTextModelOutput("le-mining.contacts", output),
});
