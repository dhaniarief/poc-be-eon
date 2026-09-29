import { createTool } from "@mastra/core/tools";
import { toTextModelOutput } from "../../runtime/model-output.js";
import { emptyToolInputSchema } from "../../schemas/common.schema.js";
import { routeEstimateResultSchema } from "../../schemas/location.schema.js";
import { opportunityRequestContextSchema } from "../../runtime/opportunity-context.js";
import { runOpportunityTool } from "../../runtime/tool-execution.js";
import { getRouteEstimateForOpportunity } from "../../../services/routing/route-estimate.service.js";

export const getRouteEstimateTool = createTool({
  id: "common.get_route_estimate",
  description:
    "Calculate road distance and driving time for the active opportunity from canonical delivery locations. Use only for explicit route, distance, travel-time, transit, or delivery-estimate questions.",
  requestContextSchema: opportunityRequestContextSchema,
  inputSchema: emptyToolInputSchema,
  outputSchema: routeEstimateResultSchema,
  execute: async (_input, context) =>
    runOpportunityTool({ context, execute: getRouteEstimateForOpportunity }),
  toModelOutput: (output) => toTextModelOutput("common.get_route_estimate", output),
});
