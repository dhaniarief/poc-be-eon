import { createTool } from "@mastra/core/tools";
import { stockInputSchema, salesObjectOutputSchema } from "../../schemas/sales.schema.js";
import { checkStock } from "../../../services/sales/sales-intelligence.service.js";
import { toTextModelOutput } from "../../runtime/model-output.js";

export const checkStockTool = createTool({
  id: "sales.check_stock",
  description:
    "Check live FinOps stock. Preferred input is CRM productId plus optional CRM uomId. Internally resolves CRM Product Name + UOM Name -> ProductsV2 -> ProductNumber -> ReleasedProductsV2 ItemNumber -> stock. If productId has no uomId, all CRM UOM schedule candidates are tried and only real FinOps mappings resolve. itemId can bypass CRM when explicitly provided.",
  inputSchema: stockInputSchema,
  outputSchema: salesObjectOutputSchema,
  execute: async (input) => checkStock(input),
  toModelOutput: (output) => toTextModelOutput("sales.check_stock", output),
});
