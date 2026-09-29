import { getDeliveryContextForOpportunity } from "../microsoft/dynamics-finops/delivery-context.service.js";
import { calculateRoadRoute } from "./road-route.service.js";
import { hasCoordinates } from "../../utils/location.util.js";
import type { ResolvedLocation } from "../../domain/location.types.js";

export async function getRouteEstimateFromLocations(input: {
  opportunityId: string;
  noOpp: string;
  origin: ResolvedLocation;
  destination: ResolvedLocation;
}) {
  const { opportunityId, noOpp, origin, destination } = input;

  if (!hasCoordinates(origin) || !hasCoordinates(destination)) {
    return {
      available: false,
      opportunityId,
      noOpp,
      origin,
      destination,
      route: null,
      reason: "Origin or destination coordinates are not available.",
    };
  }

  const route = await calculateRoadRoute(
    {
      latitude: origin.latitude as number,
      longitude: origin.longitude as number,
    },
    {
      latitude: destination.latitude as number,
      longitude: destination.longitude as number,
    },
  );

  if (!route) {
    return {
      available: false,
      opportunityId,
      noOpp,
      origin,
      destination,
      route: null,
      reason: "Road route could not be calculated.",
    };
  }

  return {
    available: true,
    opportunityId,
    noOpp,
    origin,
    destination,
    route: {
      distanceKm: route.distanceKm,
      drivingHours: route.drivingHours,
      source: "OSRM_OPENSTREETMAP",
      note: "Driving time is a route estimate, not a confirmed logistics SLA.",
    },
    reason: null,
  };
}

export async function getRouteEstimateForOpportunity(opportunityId: string) {
  const context = await getDeliveryContextForOpportunity(opportunityId);

  return await getRouteEstimateFromLocations({
    opportunityId,
    noOpp: context.noOpp,
    origin: context.origin,
    destination: context.destination,
  });
}
