import { createTool } from "@mastra/core/tools";
import { toTextModelOutput } from "../../runtime/model-output.js";
import { z } from "zod";
import { emptyToolInputSchema } from "../../schemas/common.schema.js";
import { opportunityRequestContextSchema } from "../../runtime/opportunity-context.js";
import { runOpportunityTool } from "../../runtime/tool-execution.js";
import { getOpportunityProducts } from "../../../services/microsoft/dynamics-crm/opportunity.service.js";

export const getOpportunityProductsTool = createTool({
  id: "crm.get_opportunity_products",
  description:
    "Get active opportunity product lines from Dynamics 365 CRM, including product name, quantity, UOM, price, amount, and discount.",
  requestContextSchema: opportunityRequestContextSchema,
  inputSchema: emptyToolInputSchema,
  outputSchema: z.object({
    products: z.array(
      z.object({
        name: z.string(),
        quantity: z.number(),
        uom: z.string(),
        price: z.number(),
        amount: z.number(),
        discount: z.number(),
      }),
    ),
  }),
  execute: async (_input, context) =>
    runOpportunityTool({ context, execute: getOpportunityProducts }),
  toModelOutput: (output) => toTextModelOutput("crm.get_opportunity_products", output),
});
