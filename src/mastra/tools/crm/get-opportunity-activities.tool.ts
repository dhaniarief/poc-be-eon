import { createTool } from "@mastra/core/tools";
import { toTextModelOutput } from "../../runtime/model-output.js";
import { z } from "zod";
import { emptyToolInputSchema } from "../../schemas/common.schema.js";
import { opportunityRequestContextSchema } from "../../runtime/opportunity-context.js";
import { runOpportunityTool } from "../../runtime/tool-execution.js";
import { getOpportunityActivities } from "../../../services/microsoft/dynamics-crm/opportunity.service.js";

export const getOpportunityActivitiesTool = createTool({
  id: "crm.get_opportunity_activities",
  description:
    "Get recent CRM activities for the active opportunity, including subject, owner, status, and start date.",
  requestContextSchema: opportunityRequestContextSchema,
  inputSchema: emptyToolInputSchema,
  outputSchema: z.object({
    activities: z.array(
      z.object({
        subject: z.string(),
        owner: z.string(),
        status: z.string(),
        startDate: z.string(),
      }),
    ),
  }),
  execute: async (_input, context) =>
    runOpportunityTool({ context, execute: getOpportunityActivities }),
  toModelOutput: (output) => toTextModelOutput("crm.get_opportunity_activities", output),
});
