import { z } from "zod";
import { dataverseGuidSchema } from "./sales.schema.js";

export const leMiningProductSearchInputSchema = z.object({
  query: z
    .string()
    .trim()
    .max(300)
    .optional()
    .default("")
    .describe(
      "Optional product name, product code, application keyword, or CRM description keyword. Leave empty only when listing eligible products.",
    ),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export const leMiningProductSearchResultSchema = z.object({
  found: z.boolean(),
  query: z.string(),
  scope: z.object({
    productFamilyValue: z.number().int(),
    stateCode: z.number().int(),
    industryValues: z.array(z.number().int()),
    industryLabels: z.array(z.string()),
  }),
  totalEligible: z.number().int().nonnegative(),
  totalMatched: z.number().int().nonnegative(),
  returned: z.number().int().nonnegative(),
  products: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      productNumber: z.string(),
      description: z.string().nullable(),
      productFamilyValue: z.number().int(),
      stateCode: z.number().int(),
      statusCode: z.number().int().nullable(),
      industryValues: z.array(z.number().int()),
      industryLabels: z.array(z.string()),
      defaultUomId: z.string().nullable(),
      defaultUomScheduleId: z.string().nullable(),
    }),
  ),
});

export const leMiningKnowledgeSearchInputSchema = z.object({
  query: z.string().trim().min(2).max(2000),
  topK: z.number().int().min(1).max(5).optional().default(5),
});

export const lePublicWebSearchInputSchema = z.object({
  query: z.string().trim().min(2).max(500),
});

export const lePublicWebSearchResultSchema = z.object({
  query: z.string(),
  provider: z.literal("searxng-restricted"),
  allowedDomains: z.array(z.string()),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
      engine: z.string().optional(),
    }),
  ),
});

export const leMiningCustomerSearchInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(2)
    .max(300)
    .describe("Customer/company name or CRM account number."),
  limit: z.number().int().min(1).max(50).optional().default(10),
  activeOnly: z.boolean().optional().default(false),
});

export const leMiningCustomerSearchResultSchema = z.object({
  found: z.boolean(),
  query: z.string(),
  returned: z.number().int().nonnegative(),
  customers: z.array(
    z.object({
      accountId: z.string(),
      name: z.string(),
      accountNumber: z.string().nullable(),
      description: z.string().nullable(),
      websiteUrl: z.string().nullable(),
      telephone: z.string().nullable(),
      city: z.string().nullable(),
      stateOrProvince: z.string().nullable(),
      country: z.string().nullable(),
      industry: z.string().nullable(),
      active: z.boolean(),
    }),
  ),
  note: z.string(),
});

export const leMiningContactSearchInputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .max(300)
      .optional()
      .describe("Person name, job title, or exact business email."),
    customerId: dataverseGuidSchema
      .optional()
      .describe("Resolved CRM Account ID when listing people for a customer."),
    limit: z.number().int().min(1).max(50).optional().default(10),
    activeOnly: z.boolean().optional().default(false),
  })
  .refine((value) => Boolean(value.query?.trim() || value.customerId), {
    message: "query or customerId is required",
  });

export const leMiningContactSearchResultSchema = z.object({
  found: z.boolean(),
  query: z.string(),
  customerId: z.string().nullable(),
  returned: z.number().int().nonnegative(),
  contacts: z.array(
    z.object({
      contactId: z.string(),
      fullName: z.string(),
      jobTitle: z.string().nullable(),
      email: z.string().nullable(),
      telephone: z.string().nullable(),
      mobilePhone: z.string().nullable(),
      parentCustomerId: z.string().nullable(),
      parentCustomerName: z.string().nullable(),
      active: z.boolean(),
    }),
  ),
  note: z.string(),
});

export const lePublicIntelligenceSearchInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(2)
    .max(500)
    .describe(
      "Focused public research query about a company, customer, person, mining operation, project, market, or current news. Not for product research.",
    ),
});

export const lePublicIntelligenceSearchResultSchema = z.object({
  query: z.string(),
  provider: z.literal("searxng-public"),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
      engine: z.string().optional(),
    }),
  ),
});
