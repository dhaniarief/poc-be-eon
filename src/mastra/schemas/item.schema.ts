import { z } from "zod";

export const itemResolutionStatusSchema = z.enum([
  "RESOLVED",
  "INVALID_SOURCE_PRODUCT",
  "PRODUCT_NOT_FOUND",
  "PRODUCT_NUMBER_NOT_FOUND",
  "AMBIGUOUS_PRODUCT_NAME",
  "ITEM_NOT_RELEASED",
  "ITEM_NUMBER_NOT_FOUND",
  "AMBIGUOUS_ITEM_NUMBER",
]);

export const resolvedOpportunityItemSchema = z.object({
  status: itemResolutionStatusSchema,
  productName: z.string(),
  uom: z.string(),
  finopsProductName: z.string(),
  productNumber: z.string().nullable(),
  itemNumber: z.string().nullable(),
  opportunityProductId: z.string().nullable(),
  requestedQuantity: z.number(),
});

export const resolvedOpportunityItemsResultSchema = z.object({
  opportunityId: z.string(),
  summary: z.object({
    total: z.number(),
    resolved: z.number(),
    unresolved: z.number(),
  }),
  items: z.array(resolvedOpportunityItemSchema),
});

export const stockItemSchema = resolvedOpportunityItemSchema.extend({
  warehouse: z.string(),
  available: z.number().nullable(),
  stockStatus: z.enum(["SUFFICIENT", "SHORTAGE", "UNRESOLVED_ITEM"]),
});

export const stockAvailabilityResultSchema = z.object({
  warehouse: z.string(),
  summary: z.object({
    total: z.number(),
    sufficient: z.number(),
    shortage: z.number(),
    unresolved: z.number(),
  }),
  items: z.array(stockItemSchema),
});
