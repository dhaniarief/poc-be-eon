import { getOpportunityDeliveryData } from "../dynamics-crm/opportunity-delivery.service.js";
import { getOpportunityInventorySite } from "./opportunity-context.service.js";
import {
  getOpportunityDeliveryPoint,
  resolveDeliveryDestination,
  resolveDeliveryOrigin,
} from "../../routing/delivery-location-resolver.service.js";
import { hasCoordinates } from "../../../utils/location.util.js";
import { normalizeText } from "../../../utils/text.util.js";

/**
 * Canonical delivery context used by route workflows and delivery analysis.
 * This service only orchestrates source resolution; origin/destination parsing
 * and geocoding live in the shared routing resolver.
 */
export async function getDeliveryContextForOpportunity(opportunityId: string) {
  const [opportunity, inventorySiteId] = await Promise.all([
    getOpportunityDeliveryData(opportunityId),
    getOpportunityInventorySite(opportunityId),
  ]);

  const [origin, destination] = await Promise.all([
    resolveDeliveryOrigin(inventorySiteId),
    resolveDeliveryDestination(opportunity),
  ]);

  return {
    opportunityId,
    noOpp: normalizeText(opportunity.new_noopp),
    inventorySiteId: inventorySiteId || null,
    deliveryPoint: getOpportunityDeliveryPoint(opportunity),
    destinationId: opportunity._new_destinationid_value ?? null,
    origin,
    destination,
    readyForEstimation: hasCoordinates(origin) && hasCoordinates(destination),
  };
}
