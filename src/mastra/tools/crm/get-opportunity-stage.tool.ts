import { createTool } from "@mastra/core/tools";
import { toTextModelOutput } from "../../runtime/model-output.js";
import { z } from "zod";
import { emptyToolInputSchema } from "../../schemas/common.schema.js";
import { opportunityRequestContextSchema } from "../../runtime/opportunity-context.js";
import { runOpportunityTool } from "../../runtime/tool-execution.js";
import { getOpportunityStage } from "../../../services/microsoft/dynamics-crm/opportunity.service.js";

export const getOpportunityStageTool = createTool({
  id: "crm.get_opportunity_stage",
  description:
    "Get current CRM opportunity stage, status, forecast category, PO readiness, Sales Coordinator/Admin verification, and PPIC state.",
  requestContextSchema: opportunityRequestContextSchema,
  inputSchema: emptyToolInputSchema,
  outputSchema: z.object({
    opportunityId: z.string(),
    noOpp: z.string(),
    name: z.string(),
    process: z.object({
      stepName: z.string(),
      opportunityStage: z.string(),
      salesStage: z.string(),
      salesStageCode: z.string(),
    }),
    status: z.object({
      state: z.string(),
      status: z.string(),
      forecastCategory: z.string(),
    }),
    orderReadiness: z.object({
      purchaseOrder: z.string(),
      salesCoordinatorVerified: z.string(),
      adminVerified: z.string(),
      ppicStatus: z.string(),
      ppicNote: z.string(),
    }),
  }),
  execute: async (_input, context) =>
    runOpportunityTool({ context, execute: getOpportunityStage }),
  toModelOutput: (output) => toTextModelOutput("crm.get_opportunity_stage", output),
});
