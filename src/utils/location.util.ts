import type { ResolvedLocation } from "../domain/location.types.js";

import { normalizeText, uniqueParts } from "./text.util.js";

const NULL_ISLAND_EPSILON = 0.000001;

export type IndonesiaAddressHints = {
  district: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
};

export function cleanLocationText(value: unknown): string {
  let text = normalizeText(value);

  if (!text) {
    return "";
  }

  /*
   * FinOps formatted addresses can contain
   * unresolved placeholders such as %1.
   */
  text = text.replace(/%1/gi, " ");

  /*
   * Normalize comma spacing:
   *
   * Kampar , Riau ,%1
   *
   * becomes:
   *
   * Kampar, Riau
   */
  text = text.replace(/\s*,\s*/g, ", ");

  /*
   * Remove duplicate commas.
   */
  text = text.replace(/(?:,\s*){2,}/g, ", ");

  /*
   * Remove leading/trailing commas.
   */
  text = text.replace(/^(?:,\s*)+/, "");

  text = text.replace(/(?:,\s*)+$/, "");

  return normalizeText(text);
}

export function normalizeCoordinate(
  value: unknown,
  type: "latitude" | "longitude",
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return null;
  }

  const min = type === "latitude" ? -90 : -180;

  const max = type === "latitude" ? 90 : 180;

  if (numeric < min || numeric > max) {
    return null;
  }

  return numeric;
}

export function hasCoordinates(
  location: Pick<ResolvedLocation, "latitude" | "longitude">,
): boolean {
  const latitude = normalizeCoordinate(location.latitude, "latitude");

  const longitude = normalizeCoordinate(location.longitude, "longitude");

  if (latitude === null || longitude === null) {
    return false;
  }

  /*
   * FinOps sometimes returns 0 / 0 when
   * coordinates were never configured.
   *
   * 0 latitude by itself is valid.
   * 0 longitude by itself is valid.
   *
   * But the exact pair 0,0 is treated
   * as "not configured".
   */
  if (
    Math.abs(latitude) < NULL_ISLAND_EPSILON &&
    Math.abs(longitude) < NULL_ISLAND_EPSILON
  ) {
    return false;
  }

  return true;
}

function extractAdministrativeValue(
  value: string,
  labels: string[],
): string | null {
  for (const label of labels) {
    const pattern = new RegExp(`\\b${label}\\s+([^,]+)`, "i");

    const match = value.match(pattern);

    if (match?.[1]) {
      return cleanLocationText(match[1]);
    }
  }

  return null;
}

export function extractIndonesiaAddressHints(
  value: unknown,
): IndonesiaAddressHints {
  const text = cleanLocationText(value);

  if (!text) {
    return {
      district: null,

      city: null,

      province: null,

      postalCode: null,
    };
  }

  const postalCode = text.match(/\b(\d{5})\b/)?.[1] ?? null;

  const district = extractAdministrativeValue(
    text,

    ["Kecamatan", "Kec\\.", "Kec"],
  );

  const city = extractAdministrativeValue(
    text,

    ["Kabupaten", "Kab\\.", "Kab", "Kota"],
  );

  let province: string | null = null;

  /*
   * Typical Indonesian address ending:
   *
   * ..., Kabupaten Bengkalis, Riau 28784
   *
   * Extract "Riau" from the segment
   * immediately before the postal code.
   */
  if (postalCode) {
    const provincePattern = new RegExp(
      `(?:^|,)\\s*([^,]+?)\\s+${postalCode}\\b`,
      "i",
    );

    const match = text.match(provincePattern);

    if (match?.[1]) {
      province = cleanLocationText(match[1]);
    }
  }

  return {
    district: district || null,

    city: city || null,

    province: province || null,

    postalCode,
  };
}

export function buildLocationRouteText(input: {
  formattedAddress?: unknown;

  street?: unknown;

  streetNumber?: unknown;

  district?: unknown;

  city?: unknown;

  province?: unknown;

  postalCode?: unknown;

  country?: unknown;
}): string | null {
  const formattedAddress = cleanLocationText(input.formattedAddress);

  if (formattedAddress) {
    return formattedAddress;
  }

  const street = uniqueParts([input.street, input.streetNumber])
    .map(cleanLocationText)
    .filter(Boolean)
    .join(" ");

  const result = uniqueParts([
    street,
    input.district,
    input.city,
    input.province,
    input.postalCode,
    input.country,
  ])
    .map(cleanLocationText)
    .filter(Boolean)
    .join(", ");

  return cleanLocationText(result) || null;
}
