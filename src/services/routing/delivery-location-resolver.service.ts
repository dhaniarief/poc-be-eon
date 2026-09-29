import type {
  CRMOpportunityDeliverySource,
  FinOpsOperationalSiteSource,
} from "../../domain/delivery.types.js";

import type { ResolvedLocation } from "../../domain/location.types.js";

import { finopsGet } from "../microsoft/dynamics-finops/finops-client.js";

import { escapeODataString } from "../../utils/odata.util.js";

import {
  buildLocationRouteText,
  cleanLocationText,
  extractIndonesiaAddressHints,
  hasCoordinates,
  normalizeCoordinate,
} from "../../utils/location.util.js";

import { normalizeText, uniqueParts } from "../../utils/text.util.js";

import { geocodeWithFallback } from "./geocoding.service.js";

function emptyLocation(
  source: string,

  name: string | null = null,
): ResolvedLocation {
  return {
    found: false,

    source,

    name,

    address: null,

    city: null,

    district: null,

    province: null,

    postalCode: null,

    country: null,

    latitude: null,

    longitude: null,

    coordinateSource: "NONE",

    routeText: null,
  };
}

function normalizeCountry(value: unknown): string {
  const country = normalizeText(value);

  if (!country) {
    return "Indonesia";
  }

  const upper = country.toUpperCase();

  if (upper === "ID" || upper === "IDN" || upper === "INDONESIA") {
    return "Indonesia";
  }

  return country;
}

async function loadOperationalSite(
  siteId: string,
): Promise<FinOpsOperationalSiteSource | null> {
  const data = await finopsGet<{
    value: FinOpsOperationalSiteSource[];
  }>(
    "OperationalSitesV2",

    {
      $select: [
        "SiteId",
        "SiteName",
        "FormattedPrimaryAddress",
        "PrimaryAddressStreet",
        "PrimaryAddressStreetNumber",
        "PrimaryAddressDistrictName",
        "PrimaryAddressCity",
        "PrimaryAddressStateId",
        "PrimaryAddressZipCode",
        "PrimaryAddressCountryRegionId",
        "PrimaryAddressLatitude",
        "PrimaryAddressLongitude",
      ].join(","),

      $filter:
        `dataAreaId eq 'ecp' ` + `and SiteId eq '${escapeODataString(siteId)}'`,
    },
  );

  return data.value[0] ?? null;
}

export async function resolveDeliveryOrigin(
  siteId: string,
): Promise<ResolvedLocation> {
  const normalizedSiteId = normalizeText(siteId);

  if (!normalizedSiteId) {
    return emptyLocation("FINOPS_OPERATIONAL_SITE");
  }

  const row = await loadOperationalSite(normalizedSiteId);

  if (!row) {
    return emptyLocation("FINOPS_OPERATIONAL_SITE", normalizedSiteId);
  }

  const city = cleanLocationText(row.PrimaryAddressCity) || null;

  const district = cleanLocationText(row.PrimaryAddressDistrictName) || null;

  const province = cleanLocationText(row.PrimaryAddressStateId) || null;

  const postalCode = cleanLocationText(row.PrimaryAddressZipCode) || null;

  const country = normalizeCountry(row.PrimaryAddressCountryRegionId);

  const routeText = buildLocationRouteText({
    formattedAddress: row.FormattedPrimaryAddress,

    street: row.PrimaryAddressStreet,

    streetNumber: row.PrimaryAddressStreetNumber,

    district,

    city,

    province,

    postalCode,

    country,
  });

  const parsedRouteHints = extractIndonesiaAddressHints(routeText);

  const latitude = normalizeCoordinate(row.PrimaryAddressLatitude, "latitude");

  const longitude = normalizeCoordinate(
    row.PrimaryAddressLongitude,
    "longitude",
  );

  const rawCoordinatesValid = hasCoordinates({
    latitude,
    longitude,
  });

  const origin: ResolvedLocation = {
    found: true,

    source: "FINOPS_OPERATIONAL_SITE",

    name: cleanLocationText(row.SiteName) || normalizedSiteId,

    address: routeText,

    city: city ?? parsedRouteHints.city,

    district: district ?? parsedRouteHints.district,

    province: province ?? parsedRouteHints.province,

    postalCode: postalCode ?? parsedRouteHints.postalCode,

    country,

    latitude: rawCoordinatesValid ? latitude : null,

    longitude: rawCoordinatesValid ? longitude : null,

    coordinateSource: rawCoordinatesValid ? "FINOPS" : "NONE",

    routeText,
  };

  /*
   * FinOps already contains usable
   * coordinates.
   */
  if (hasCoordinates(origin)) {
    return origin;
  }

  /*
   * Otherwise geocode using the FinOps
   * address, but require the result to
   * match the expected administrative
   * location.
   */
  const geocoded = await geocodeWithFallback(
    routeText,

    [origin.district, origin.city, origin.province, origin.postalCode, country],

    {
      expectedText: routeText,

      district: origin.district,

      city: origin.city,

      province: origin.province,

      postalCode: origin.postalCode,

      country,
    },
  );

  if (!geocoded) {
    /*
     * Safer behavior:
     *
     * Keep coordinateSource=NONE.
     * Route workflow will refuse to
     * estimate rather than using a
     * wrong coordinate.
     */
    return origin;
  }

  return {
    ...origin,

    address: origin.address ?? geocoded.displayName,

    city: origin.city ?? geocoded.city,

    district: origin.district ?? geocoded.district,

    province: origin.province ?? geocoded.province,

    postalCode: origin.postalCode ?? geocoded.postalCode,

    country: origin.country ?? geocoded.country,

    latitude: geocoded.latitude,

    longitude: geocoded.longitude,

    coordinateSource: "GEOCODED",

    routeText: origin.routeText ?? geocoded.displayName,
  };
}

export function getOpportunityDeliveryPoint(
  opportunity: CRMOpportunityDeliverySource,
): string | null {
  return (
    cleanLocationText(
      opportunity[
        "new_deliverypointharussamadenganygdisordelive@OData.Community.Display.V1.FormattedValue"
      ],
    ) ||
    cleanLocationText(
      opportunity.new_deliverypointharussamadenganygdisordelive,
    ) ||
    null
  );
}

export async function resolveDeliveryDestination(
  opportunity: CRMOpportunityDeliverySource,
): Promise<ResolvedLocation> {
  const deliveryPoint = getOpportunityDeliveryPoint(opportunity);

  const shippingAddress = cleanLocationText(opportunity.new_shippingaddress);

  const destinationName = cleanLocationText(
    opportunity[
      "_new_destinationid_value@OData.Community.Display.V1.FormattedValue"
    ],
  );

  const regency =
    cleanLocationText(
      opportunity["new_regencyxd@OData.Community.Display.V1.FormattedValue"],
    ) || cleanLocationText(opportunity.new_regencyxd);

  const zone =
    cleanLocationText(
      opportunity["new_zona@OData.Community.Display.V1.FormattedValue"],
    ) || cleanLocationText(opportunity.new_zona);

  /*
   * Extract useful administrative
   * information from free-text CRM
   * shipping address.
   *
   * Example:
   *
   * Kecamatan Bathin Solapan
   * Kabupaten Bengkalis
   * Riau 28784
   */
  const parsedAddress = extractIndonesiaAddressHints(shippingAddress);

  const city = regency || parsedAddress.city || zone || null;

  const district = parsedAddress.district;

  const province = parsedAddress.province;

  const postalCode = parsedAddress.postalCode;

  const country = "Indonesia";

  const fallbackRouteText = uniqueParts([
    deliveryPoint,
    destinationName,
    district,
    city,
    province,
    postalCode,
    country,
  ])
    .map(cleanLocationText)
    .filter(Boolean)
    .join(", ");

  const routeText = shippingAddress || fallbackRouteText || null;

  const destination: ResolvedLocation = {
    found: Boolean(routeText),

    source: "CRM_OPPORTUNITY",

    name: deliveryPoint || destinationName || null,

    address: shippingAddress || null,

    city,

    district,

    province,

    postalCode,

    country,

    latitude: null,

    longitude: null,

    coordinateSource: "NONE",

    routeText,
  };

  if (!routeText) {
    return destination;
  }

  const geocoded = await geocodeWithFallback(
    routeText,

    [
      deliveryPoint,
      destinationName,
      district,
      city,
      province,
      postalCode,
      country,
    ],

    {
      expectedText: routeText,

      district,

      city,

      province,

      postalCode,

      country,
    },
  );

  if (!geocoded) {
    /*
     * Do not fall back to an unrelated
     * city simply because Nominatim
     * returned a result.
     */
    return destination;
  }

  return {
    ...destination,

    address: destination.address ?? geocoded.displayName,

    /*
     * CRM / parsed administrative
     * information has priority.
     *
     * Geocoding only fills missing
     * values.
     */
    city: destination.city ?? geocoded.city,

    district: destination.district ?? geocoded.district,

    province: destination.province ?? geocoded.province,

    postalCode: destination.postalCode ?? geocoded.postalCode,

    country: destination.country ?? geocoded.country,

    latitude: geocoded.latitude,

    longitude: geocoded.longitude,

    coordinateSource: "GEOCODED",

    routeText: destination.routeText ?? geocoded.displayName,
  };
}
