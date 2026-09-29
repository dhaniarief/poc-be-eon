import { createTool } from "@mastra/core/tools";
import { toTextModelOutput } from "../../runtime/model-output.js";
import { z } from "zod";
import { emptyToolInputSchema } from "../../schemas/common.schema.js";
import { opportunityRequestContextSchema } from "../../runtime/opportunity-context.js";
import { runOpportunityTool } from "../../runtime/tool-execution.js";
import { getSalesOrdersForOpportunity } from "../../../services/microsoft/dynamics-finops/sales-order.service.js";

const salesOrderSchema = z.object({
  salesOrderNumber: z.string(),
  customerOrderReference: z.string(),
  status: z.string(),
  processingStatus: z.string(),
  salesOrderName: z.string(),
  customerRequisitionNumber: z.string(),
  customerAccount: z.string(),
  currency: z.string(),
  totalAmount: z.number(),
  createdAt: z.string(),
  requestedShippingDate: z.string(),
  requestedReceiptDate: z.string(),
  confirmedShippingDate: z.string(),
  confirmedReceiptDate: z.string(),
  site: z.string(),
  warehouse: z.string(),
  specialInstruction: z.string(),
});

export const getSalesOrdersTool = createTool({
  id: "finops.get_sales_orders",
  description:
    "Get Sales Orders from Dynamics 365 Finance for the active opportunity. Use for SO existence, status, value, dates, warehouse, or special instruction questions.",
  requestContextSchema: opportunityRequestContextSchema,
  inputSchema: emptyToolInputSchema,
  outputSchema: z.object({
    noOpp: z.string(),
    total: z.number(),
    salesOrders: z.array(salesOrderSchema),
  }),
  execute: async (_input, context) =>
    runOpportunityTool({ context, execute: getSalesOrdersForOpportunity }),
  toModelOutput: (output) => toTextModelOutput("finops.get_sales_orders", output),
});
