import { createTool } from "@mastra/core/tools";
import {
  msdsInputSchema,
  salesObjectOutputSchema,
} from "../../schemas/sales.schema.js";

import { getProductMsds } from "../../../services/sales/sales-intelligence.service.js";
import { toTextModelOutput } from "../../runtime/model-output.js";

export const getMsdsTool = createTool({
  id: "sales.get_msds",

  description:
    "Get the latest active MSDS/SDS for Email directly by product name. " +
    "The backend searches SharePoint by normalized product-name filename prefix. " +
    "CRM ID resolution, UOM, and FinOps item mapping are intentionally not used.",

  inputSchema: msdsInputSchema,

  outputSchema: salesObjectOutputSchema,

  execute: async (input) => {
    return getProductMsds(input.productName);
  },

  toModelOutput: (output) => toTextModelOutput("sales.get_msds", output),
});
