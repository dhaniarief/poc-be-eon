import { z } from "zod";

export const resolvedLocationSchema = z.object({
  found: z.boolean(),
  source: z.string(),
  name: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  province: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  coordinateSource: z.enum(["FINOPS", "CRM", "GEOCODED", "NONE"]),
  routeText: z.string().nullable(),
});

export const deliveryContextResultSchema = z.object({
  opportunityId: z.string(),
  noOpp: z.string(),
  inventorySiteId: z.string().nullable(),
  deliveryPoint: z.string().nullable(),
  destinationId: z.string().nullable(),
  origin: resolvedLocationSchema,
  destination: resolvedLocationSchema,
  readyForEstimation: z.boolean(),
});

export const routeEstimateResultSchema = z.object({
  available: z.boolean(),
  opportunityId: z.string(),
  noOpp: z.string(),
  origin: resolvedLocationSchema.nullable(),
  destination: resolvedLocationSchema.nullable(),
  route: z
    .object({
      distanceKm: z.number(),
      drivingHours: z.number(),
      source: z.string(),
      note: z.string(),
    })
    .nullable(),
  reason: z.string().nullable(),
});
