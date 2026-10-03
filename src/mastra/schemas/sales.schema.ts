import { z } from "zod";
import { SALES_ENTITY_TYPES } from "../../services/microsoft/dynamics-crm/sales-crm.service.js";

export const salesEntityTypeSchema = z.enum(SALES_ENTITY_TYPES);

export const resolveEntityInputSchema = z.object({
  type: salesEntityTypeSchema,
  query: z.string().trim().min(1).max(300),
});

/** Dataverse GUIDs are GUID-shaped but are not guaranteed to use RFC UUID version bits. */
export const dataverseGuidSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid Dataverse GUID",
  );

export const opportunityInputSchema = z.object({
  opportunityId: dataverseGuidSchema,
});

export const stockInputSchema = z
  .object({
    itemId: z.string().trim().min(1).optional(),
    productId: dataverseGuidSchema.optional(),
    uomId: dataverseGuidSchema.optional(),
    warehouse: z.string().trim().min(1).optional(),
  })
  .refine((value) => Boolean(value.itemId || value.productId), {
    message: "itemId or productId is required",
  });

export const msdsInputSchema = z.object({
  productName: z.string().trim().min(1).max(300),
});

export const salesMetricSchema = z.enum([
  "opportunityCount",
  "estimatedRevenue",
  "actualRevenue",
  "partialRevenue",
  "partialCount",
  "quantity",
  "salesOrderCount",
  "deliveryCount",
  "invoiceCount",
  "invoiceAmount",
]);

export const querySalesInputSchema = z.object({
  filters: z
    .object({
      salesmanId: dataverseGuidSchema.optional(),
      customerId: dataverseGuidSchema.optional(),
      productId: dataverseGuidSchema.optional(),
      opportunityId: dataverseGuidSchema.optional(),
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      status: z.enum(["open", "won", "lost", "all"]).optional(),
    })
    .optional(),

  groupBy: z
    .enum(["none", "salesman", "customer", "product", "opportunity"])
    .optional()
    .default("none"),

  metrics: z.array(salesMetricSchema).min(1).max(10),

  opportunityDateField: z
    .enum(["createdOn", "estimatedCloseDate", "actualCloseDate"])
    .optional()
    .default("createdOn"),

  /** Metric used to order grouped results, e.g. actualRevenue for Top Customers. */
  sortBy: salesMetricSchema.optional(),

  sortDirection: z.enum(["asc", "desc"]).optional().default("desc"),

  /** Maximum grouped rows returned to the model. */
  limit: z.number().int().min(1).max(100).optional(),
});

/** Flexible output on purpose: service contracts can grow without rewriting tool schemas. */
export const salesObjectOutputSchema = z.record(z.string(), z.unknown());
