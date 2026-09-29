import { createTool } from "@mastra/core/tools";
import { toTextModelOutput } from "../../runtime/model-output.js";
import { emptyToolInputSchema } from "../../schemas/common.schema.js";
import { deliveryContextResultSchema } from "../../schemas/location.schema.js";
import { opportunityRequestContextSchema } from "../../runtime/opportunity-context.js";
import { runOpportunityTool } from "../../runtime/tool-execution.js";
import { getDeliveryContextForOpportunity } from "../../../services/microsoft/dynamics-finops/delivery-context.service.js";

export const getDeliveryContextTool = createTool({
  id: "common.get_delivery_context",
  description:
    "Get canonical delivery origin and destination for the active opportunity. Use only when origin, destination, warehouse location, or shipping address details are explicitly requested.",
  requestContextSchema: opportunityRequestContextSchema,
  inputSchema: emptyToolInputSchema,
  outputSchema: deliveryContextResultSchema,
  execute: async (_input, context) =>
    runOpportunityTool({ context, execute: getDeliveryContextForOpportunity }),
  toModelOutput: (output) => toTextModelOutput("common.get_delivery_context", output),
});
