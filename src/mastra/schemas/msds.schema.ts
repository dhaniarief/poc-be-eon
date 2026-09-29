import { z } from "zod";

export const msdsDocumentSchema = z.object({
  id: z.string(),
  itemNumber: z.string(),
  fileName: z.string().nullable(),
  category: z.string().nullable(),
  url: z.string().nullable(),
  sharePointUrl: z.string().nullable(),
  remarks: z.string().nullable(),
  lastModifiedDateTime: z.string().nullable(),
});

export const msdsResultSchema = z.object({
  opportunityId: z.string(),
  summary: z.object({
    totalProducts: z.number(),
    msdsFound: z.number(),
    msdsNotFound: z.number(),
    itemNotFound: z.number(),
  }),
  products: z.array(
    z.object({
      productName: z.string(),
      uom: z.string(),
      quantity: z.number(),
      productNumber: z.string().nullable(),
      itemNumber: z.string().nullable(),
      mappingStatus: z.string(),
      msdsFound: z.boolean(),
      totalDocuments: z.number(),
      status: z.string(),
      documents: z.array(msdsDocumentSchema),
    }),
  ),
});
