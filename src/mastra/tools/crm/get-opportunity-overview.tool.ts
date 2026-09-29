import { createTool } from "@mastra/core/tools";
import { toTextModelOutput } from "../../runtime/model-output.js";
import { z } from "zod";
import { emptyToolInputSchema } from "../../schemas/common.schema.js";
import { opportunityRequestContextSchema } from "../../runtime/opportunity-context.js";
import { runOpportunityTool } from "../../runtime/tool-execution.js";
import { getOpportunityOverview } from "../../../services/microsoft/dynamics-crm/opportunity.service.js";

export const getOpportunityOverviewTool = createTool({
  id: "crm.get_opportunity_overview",
  description:
    "Get the active opportunity overview from Dynamics 365 CRM, including customer, owner, status, warehouse, destination, product family, and forecast category.",
  requestContextSchema: opportunityRequestContextSchema,
  inputSchema: emptyToolInputSchema,
  outputSchema: z.object({
    opportunityId: z.string(),
    opportunityName: z.string(),
    noOpp: z.string(),
    customer: z.string(),
    owner: z.string(),
    status: z.string(),
    warehouse: z.string(),
    destination: z.string(),
    productFamily: z.string(),
    forecastCategory: z.string(),
  }),
  execute: async (_input, context) =>
    runOpportunityTool({ context, execute: getOpportunityOverview }),
  toModelOutput: (output) => toTextModelOutput("crm.get_opportunity_overview", output),
});
