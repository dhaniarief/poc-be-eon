import { z } from "zod";

const sectionSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    status: z.enum(["available", "empty", "failed"]),
    data: data.nullable(),
    reason: z.string().nullable(),
  });

const opportunitySchema = z.object({
  opportunityName: z.string(),
  noOpp: z.string(),
  customer: z.string(),
  owner: z.string(),
  status: z.string(),
  warehouse: z.string(),
  destination: z.string(),
  productFamily: z.string(),
  forecastCategory: z.string(),
});

const stageSchema = z.object({
  noOpp: z.string(),
  name: z.string(),
  process: z.object({
    stepName: z.string(),
    opportunityStage: z.string(),
    salesStage: z.string(),
    salesStageCode: z.string(),
  }),
  status: z.object({
    state: z.string(),
    status: z.string(),
    forecastCategory: z.string(),
  }),
  orderReadiness: z.object({
    purchaseOrder: z.string(),
    salesCoordinatorVerified: z.string(),
    adminVerified: z.string(),
    ppicStatus: z.string(),
    ppicNote: z.string(),
  }),
});

const productsSchema = z.object({
  total: z.number(),
  totalQuantity: z.number(),
  totalAmount: z.number(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      uom: z.string(),
      amount: z.number(),
      discount: z.number(),
    }),
  ),
});

const activitiesSchema = z.object({
  total: z.number(),
  open: z.number(),
  items: z.array(
    z.object({
      subject: z.string(),
      owner: z.string(),
      status: z.string(),
      startDate: z.string(),
    }),
  ),
});

const stockSchema = z.object({
  warehouse: z.string(),
  summary: z.object({
    total: z.number(),
    sufficient: z.number(),
    shortage: z.number(),
    unresolved: z.number(),
  }),
  items: z.array(
    z.object({
      productName: z.string(),
      uom: z.string(),
      requestedQuantity: z.number(),
      available: z.number().nullable(),
      stockStatus: z.enum(["SUFFICIENT", "SHORTAGE", "UNRESOLVED_ITEM"]),
    }),
  ),
});

const salesOrdersSchema = z.object({
  total: z.number(),
  items: z.array(
    z.object({
      salesOrderNumber: z.string(),
      status: z.string(),
      totalAmount: z.number(),
      warehouse: z.string(),
      requestedShippingDate: z.string(),
      requestedReceiptDate: z.string(),
      confirmedShippingDate: z.string(),
      confirmedReceiptDate: z.string(),
      specialInstruction: z.string(),
    }),
  ),
});

const deliveriesSchema = z.object({
  total: z.number(),
  items: z.array(
    z.object({
      salesOrderNumber: z.string(),
      packingSlipId: z.string(),
      deliveryDate: z.string(),
      receiptDate: z.string(),
      quantity: z.number(),
      warehouse: z.string(),
      received: z.string(),
    }),
  ),
});

const invoicesSchema = z.object({
  total: z.number(),
  totalInvoiceAmount: z.number(),
  items: z.array(
    z.object({
      invoiceNumber: z.string(),
      invoiceDate: z.string(),
      salesOrderNumber: z.string(),
      currency: z.string(),
      paymentTerms: z.string(),
      invoiceAmount: z.number(),
      taxAmount: z.number(),
    }),
  ),
});

const msdsSchema = z.object({
  summary: z.object({
    totalProducts: z.number(),
    msdsFound: z.number(),
    msdsNotFound: z.number(),
    itemNotFound: z.number(),
  }),
  products: z.array(
    z.object({
      productName: z.string(),
      msdsFound: z.boolean(),
      totalDocuments: z.number(),
    }),
  ),
});

export const opportunityIntelligenceSchema = z.object({
  opportunity: sectionSchema(opportunitySchema),
  stage: sectionSchema(stageSchema),
  products: sectionSchema(productsSchema),
  activities: sectionSchema(activitiesSchema),
  stock: sectionSchema(stockSchema),
  salesOrders: sectionSchema(salesOrdersSchema),
  deliveries: sectionSchema(deliveriesSchema),
  invoices: sectionSchema(invoicesSchema),
  msds: sectionSchema(msdsSchema),
});

export type OpportunityIntelligence = z.infer<typeof opportunityIntelligenceSchema>;
