import { createTool } from "@mastra/core/tools";
import { toTextModelOutput } from "../../runtime/model-output.js";
import { emptyToolInputSchema } from "../../schemas/common.schema.js";
import { opportunityIntelligenceSchema } from "../../schemas/opportunity-intelligence.schema.js";
import { opportunityRequestContextSchema } from "../../runtime/opportunity-context.js";
import { runOpportunityTool } from "../../runtime/tool-execution.js";
import { getOpportunityIntelligence } from "../../../services/opportunity/opportunity-intelligence.service.js";

export const getOpportunityIntelligenceTool = createTool({
  id: "common.get_opportunity_intelligence",
  description:
    "Get one compact internal CRM, FinOps, and SharePoint snapshot for a broad summary of the active opportunity. Use for broad opportunity health/readiness requests. It does not calculate route/distance and does not perform public web research.",
  requestContextSchema: opportunityRequestContextSchema,
  inputSchema: emptyToolInputSchema,
  outputSchema: opportunityIntelligenceSchema,
  execute: async (_input, context) =>
    runOpportunityTool({ context, execute: getOpportunityIntelligence }),
  toModelOutput: (output) => toTextModelOutput("common.get_opportunity_intelligence", output),
});
