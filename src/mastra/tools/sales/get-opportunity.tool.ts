import { createTool } from "@mastra/core/tools";
import { opportunityInputSchema, salesObjectOutputSchema } from "../../schemas/sales.schema.js";
import { getOpportunityIntelligence } from "../../../services/sales/sales-intelligence.service.js";
import { toTextModelOutput } from "../../runtime/model-output.js";

export const getOpportunityTool = createTool({
  id: "sales.get_opportunity",
  description:
    "Get a broad live Opportunity snapshot by opportunityId: CRM header, products, activities, partial history and partial count/revenue, actual revenue, FinOps SO/DO/invoices, stock, and MSDS for Email.",
  inputSchema: opportunityInputSchema,
  outputSchema: salesObjectOutputSchema,
  execute: async (input) => getOpportunityIntelligence(input.opportunityId),
  toModelOutput: (output) => toTextModelOutput("sales.get_opportunity", output),
});
