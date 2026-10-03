import { createTool } from "@mastra/core/tools";
import { resolveEntityInputSchema, salesObjectOutputSchema } from "../../schemas/sales.schema.js";
import { resolveSalesEntity } from "../../../services/sales/sales-intelligence.service.js";
import { toTextModelOutput } from "../../runtime/model-output.js";

export const resolveEntityTool = createTool({
  id: "sales.resolve_entity",
  description:
    "Resolve a user-provided salesman, customer, product, opportunity, or UOM name/code into canonical CRM IDs. Always use this before ID-based CRM queries when the user only supplied a name. Never guess among ambiguous candidates.",
  inputSchema: resolveEntityInputSchema,
  outputSchema: salesObjectOutputSchema,
  execute: async (input) => resolveSalesEntity(input.type, input.query),
  toModelOutput: (output) => toTextModelOutput("sales.resolve_entity", output),
});
