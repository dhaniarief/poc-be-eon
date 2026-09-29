import { createTool } from "@mastra/core/tools";
import { toTextModelOutput } from "../../runtime/model-output.js";
import { emptyToolInputSchema } from "../../schemas/common.schema.js";
import { stockAvailabilityResultSchema } from "../../schemas/item.schema.js";
import { opportunityRequestContextSchema } from "../../runtime/opportunity-context.js";
import { runOpportunityTool } from "../../runtime/tool-execution.js";
import { checkOpportunityStock } from "../../../services/microsoft/dynamics-finops/stock.service.js";

export const checkStockAvailabilityTool = createTool({
  id: "finops.check_stock_availability",
  description:
    "Check current FinOps stock readiness for all active opportunity products. Item mapping is deterministic; unresolved items are never guessed or treated as zero stock.",
  requestContextSchema: opportunityRequestContextSchema,
  inputSchema: emptyToolInputSchema,
  outputSchema: stockAvailabilityResultSchema,
  execute: async (_input, context) =>
    runOpportunityTool({ context, execute: checkOpportunityStock }),
  toModelOutput: (output) => toTextModelOutput("finops.check_stock_availability", output),
});
