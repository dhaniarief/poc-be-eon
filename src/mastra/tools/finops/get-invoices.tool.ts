import { createTool } from "@mastra/core/tools";
import { toTextModelOutput } from "../../runtime/model-output.js";
import { z } from "zod";
import { emptyToolInputSchema } from "../../schemas/common.schema.js";
import { opportunityRequestContextSchema } from "../../runtime/opportunity-context.js";
import { runOpportunityTool } from "../../runtime/tool-execution.js";
import { getInvoicesForOpportunity } from "../../../services/microsoft/dynamics-finops/invoice.service.js";

const invoiceSchema = z.object({
  invoiceNumber: z.string(),
  invoiceDate: z.string(),
  ledgerVoucher: z.string(),
  salesOrderNumber: z.string(),
  customerReference: z.string(),
  customerAccount: z.string(),
  currency: z.string(),
  paymentTerms: z.string(),
  invoiceAmount: z.number(),
  taxAmount: z.number(),
  discountAmount: z.number(),
  chargeAmount: z.number(),
});

export const getInvoicesTool = createTool({
  id: "finops.get_invoices",
  description:
    "Get invoice records from Dynamics 365 Finance for the active opportunity. Use for invoice number, date, amount, tax, payment terms, or invoice-status context.",
  requestContextSchema: opportunityRequestContextSchema,
  inputSchema: emptyToolInputSchema,
  outputSchema: z.object({
    noOpp: z.string(),
    totalSalesOrders: z.number(),
    totalInvoices: z.number(),
    totalInvoiceAmount: z.number(),
    invoices: z.array(invoiceSchema),
  }),
  execute: async (_input, context) =>
    runOpportunityTool({ context, execute: getInvoicesForOpportunity }),
  toModelOutput: (output) => toTextModelOutput("finops.get_invoices", output),
});
