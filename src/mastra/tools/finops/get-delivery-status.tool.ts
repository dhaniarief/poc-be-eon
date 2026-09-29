import { createTool } from "@mastra/core/tools";
import { toTextModelOutput } from "../../runtime/model-output.js";
import { z } from "zod";
import { emptyToolInputSchema } from "../../schemas/common.schema.js";
import { opportunityRequestContextSchema } from "../../runtime/opportunity-context.js";
import { runOpportunityTool } from "../../runtime/tool-execution.js";
import { getDeliveryStatusForOpportunity } from "../../../services/microsoft/dynamics-finops/delivery.service.js";

const deliverySchema = z.object({
  salesOrderNumber: z.string(),
  packingSlipId: z.string(),
  internalPackingSlipId: z.string(),
  customerReference: z.string(),
  purchaseOrder: z.string(),
  deliveryDate: z.string(),
  receiptDate: z.string(),
  quantity: z.number(),
  warehouse: z.string(),
  received: z.string(),
  invoiceAccount: z.string(),
  deliveryName: z.string(),
  transporter: z.string(),
  invoiceAmount: z.number(),
});

export const getDeliveryStatusTool = createTool({
  id: "finops.get_delivery_status",
  description:
    "Get Delivery Order and Packing Slip realization from Dynamics 365 Finance for the active opportunity. Use for delivery, packing slip, shipment date, receipt date, quantity, or receipt-status questions.",
  requestContextSchema: opportunityRequestContextSchema,
  inputSchema: emptyToolInputSchema,
  outputSchema: z.object({
    noOpp: z.string(),
    totalSalesOrders: z.number(),
    totalDeliveries: z.number(),
    deliveries: z.array(deliverySchema),
  }),
  execute: async (_input, context) =>
    runOpportunityTool({ context, execute: getDeliveryStatusForOpportunity }),
  toModelOutput: (output) => toTextModelOutput("finops.get_delivery_status", output),
});
