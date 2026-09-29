import { createTool } from "@mastra/core/tools";
import { toTextModelOutput } from "../../runtime/model-output.js";
import { emptyToolInputSchema } from "../../schemas/common.schema.js";
import { resolvedOpportunityItemsResultSchema } from "../../schemas/item.schema.js";
import { opportunityRequestContextSchema } from "../../runtime/opportunity-context.js";
import { runOpportunityTool } from "../../runtime/tool-execution.js";
import { getResolvedOpportunityItems } from "../../../services/microsoft/dynamics-finops/opportunity-item.service.js";

export const resolveOpportunityItemsTool = createTool({
  id: "finops.resolve_opportunity_items",
  description:
    "Resolve active opportunity products to deterministic FinOps Product and Item Numbers. Use only when item mapping details are requested or required by a downstream operation.",
  requestContextSchema: opportunityRequestContextSchema,
  inputSchema: emptyToolInputSchema,
  outputSchema: resolvedOpportunityItemsResultSchema,
  execute: async (_input, context) =>
    runOpportunityTool({ context, execute: getResolvedOpportunityItems }),
  toModelOutput: (output) => toTextModelOutput("finops.resolve_opportunity_items", output),
});
