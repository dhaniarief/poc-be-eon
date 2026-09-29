import { createTool } from "@mastra/core/tools";
import { toTextModelOutput } from "../../runtime/model-output.js";
import { emptyToolInputSchema } from "../../schemas/common.schema.js";
import { msdsResultSchema } from "../../schemas/msds.schema.js";
import { opportunityRequestContextSchema } from "../../runtime/opportunity-context.js";
import { runOpportunityTool } from "../../runtime/tool-execution.js";
import { getOpportunityMsds } from "../../../services/microsoft/sharepoint/opportunity-msds.service.js";

export const getMsdsTool = createTool({
  id: "sharepoint.get_msds",
  description:
    "Get MSDS/SDS metadata and document links for active opportunity products from SharePoint after deterministic FinOps item mapping. Use when the user asks for MSDS/SDS or safety documents.",
  requestContextSchema: opportunityRequestContextSchema,
  inputSchema: emptyToolInputSchema,
  outputSchema: msdsResultSchema,
  execute: async (_input, context) =>
    runOpportunityTool({ context, execute: getOpportunityMsds }),
  toModelOutput: (output) => toTextModelOutput("sharepoint.get_msds", output),
});
