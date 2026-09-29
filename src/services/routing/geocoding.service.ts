import {
  cleanLocationText,
  extractIndonesiaAddressHints,
  hasCoordinates,
  normalizeCoordinate,
} from "../../utils/location.util.js";

import { normalizeText, uniqueParts } from "../../utils/text.util.js";

type NominatimAddress = {
  road?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  hamlet?: string;
  village?: string;
  town?: string;
  city?: string;
  city_district?: string;
  municipality?: string;
  county?: string;
  state_district?: string;
  state?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
};

export type GeocodeHints = {
  expectedText?: string | null;

  district?: string | null;

  city?: string | null;

  province?: string | null;

  postalCode?: string | null;

  country?: string | null;
};

export type GeocodedLocation = {
  latitude: number;
  longitude: number;

  displayName: string;

  city: string | null;

  district: string | null;

  province: string | null;

  postalCode: string | null;

  country: string | null;

  matchType: "exact" | "fallback";

  query: string;
};

type CandidateScore = {
  accepted: boolean;
  score: number;
};

const MATCH_STOPWORDS = new Set([
  "jalan",
  "jl",
  "gang",
  "gudang",
  "desa",
  "kelurahan",
  "kecamatan",
  "kabupaten",
  "kota",
  "provinsi",
  "km",
  "indonesia",
  "dan",
  "the",
]);

function normalizeForMatch(value: unknown): string {
  const text = normalizeText(value);

  if (!text) {
    return "";
  }

  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCandidateText(result: NominatimResult): string {
  const address = result.address ?? {};

  return normalizeForMatch(
    [
      result.display_name,

      address.road,
      address.suburb,
      address.neighbourhood,
      address.quarter,
      address.hamlet,
      address.village,
      address.town,
      address.city,
      address.city_district,
      address.municipality,
      address.county,
      address.state_district,
      address.state,
      address.postcode,
      address.country,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function getSignificantTokens(value: unknown): string[] {
  const normalized = normalizeForMatch(value);

  if (!normalized) {
    return [];
  }

  return [
    ...new Set(
      normalized
        .split(" ")
        .filter(
          (token) =>
            (token.length >= 4 || /^\d{5}$/.test(token)) &&
            !MATCH_STOPWORDS.has(token),
        ),
    ),
  ];
}

function candidateContains(
  candidateText: string,
  value: string | null | undefined,
): boolean {
  const expected = normalizeForMatch(value);

  if (!expected) {
    return false;
  }

  return candidateText.includes(expected);
}

function scoreCandidate(
  result: NominatimResult,
  hints: GeocodeHints,
): CandidateScore {
  const address = result.address ?? {};

  /*
   * Nominatim is already restricted using
   * countrycodes=id, but reject a result
   * explicitly marked as another country.
   */
  const countryCode = normalizeForMatch(address.country_code);

  if (countryCode && countryCode !== "id") {
    return {
      accepted: false,

      score: Number.NEGATIVE_INFINITY,
    };
  }

  const candidateText = getCandidateText(result);

  let score = 0;

  let strongMatches = 0;

  let tokenMatches = 0;

  const expectedPostalCode = normalizeText(hints.postalCode);

  const actualPostalCode = normalizeText(address.postcode);

  /*
   * Postal-code conflict is considered
   * a hard mismatch.
   *
   * Example:
   *
   * expected: 28784
   * result:   11260
   *
   * → reject Jakarta result immediately.
   */
  if (expectedPostalCode && actualPostalCode) {
    if (expectedPostalCode !== actualPostalCode) {
      return {
        accepted: false,

        score: Number.NEGATIVE_INFINITY,
      };
    }

    score += 12;

    strongMatches += 1;
  }

  const expectedProvince = normalizeForMatch(hints.province);

  const actualProvince = normalizeForMatch(address.state);

  /*
   * Province conflict is also a strong
   * rejection signal.
   *
   * expected:
   * Riau
   *
   * candidate:
   * Daerah Khusus Ibukota Jakarta
   */
  if (expectedProvince && actualProvince) {
    if (
      !actualProvince.includes(expectedProvince) &&
      !expectedProvince.includes(actualProvince)
    ) {
      return {
        accepted: false,

        score: Number.NEGATIVE_INFINITY,
      };
    }

    score += 8;

    strongMatches += 1;
  }

  if (candidateContains(candidateText, hints.city)) {
    score += 6;

    strongMatches += 1;
  }

  if (candidateContains(candidateText, hints.district)) {
    score += 6;

    strongMatches += 1;
  }

  const expectedTokens = getSignificantTokens(hints.expectedText);

  for (const token of expectedTokens) {
    if (candidateText.includes(token)) {
      tokenMatches += 1;

      score += 1;
    }
  }

  /*
   * Require actual evidence that the
   * candidate matches the requested area.
   *
   * Either:
   * - postal/province/city/district matched
   * - or at least two meaningful address
   *   tokens matched.
   */
  const accepted = strongMatches > 0 || tokenMatches >= 2;

  return {
    accepted,
    score,
  };
}

function convertCandidate(
  result: NominatimResult,
): Omit<GeocodedLocation, "matchType" | "query"> | null {
  const latitude = normalizeCoordinate(result.lat, "latitude");

  const longitude = normalizeCoordinate(result.lon, "longitude");

  if (latitude === null || longitude === null) {
    return null;
  }

  if (
    !hasCoordinates({
      latitude,
      longitude,
    })
  ) {
    return null;
  }

  const address = result.address ?? {};

  return {
    latitude,
    longitude,

    displayName: cleanLocationText(result.display_name),

    city:
      cleanLocationText(
        address.city ?? address.town ?? address.municipality ?? address.village,
      ) || null,

    district:
      cleanLocationText(
        address.city_district ??
          address.suburb ??
          address.county ??
          address.state_district,
      ) || null,

    province: cleanLocationText(address.state) || null,

    postalCode: cleanLocationText(address.postcode) || null,

    country: cleanLocationText(address.country) || null,
  };
}

async function searchGeocode(
  query: string,
  hints: GeocodeHints,
): Promise<Omit<GeocodedLocation, "matchType" | "query"> | null> {
  const normalizedQuery = cleanLocationText(query);

  if (!normalizedQuery) {
    return null;
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");

  url.searchParams.set("q", normalizedQuery);

  url.searchParams.set("format", "json");

  /*
   * Do not use limit=1.
   *
   * We need multiple candidates so that
   * an incorrect first result can be
   * rejected.
   */
  url.searchParams.set("limit", "5");

  url.searchParams.set("countrycodes", "id");

  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "EON-AI-Backend/1.0",

      "Accept-Language": "id,en",
    },
  });

  if (!response.ok) {
    throw new Error(`Geocoding failed: ${response.status}`);
  }

  const results = (await response.json()) as NominatimResult[];

  let best: {
    score: number;

    location: Omit<GeocodedLocation, "matchType" | "query">;
  } | null = null;

  for (const result of results) {
    const score = scoreCandidate(result, hints);

    if (!score.accepted) {
      continue;
    }

    const location = convertCandidate(result);

    if (!location) {
      continue;
    }

    if (!best || score.score > best.score) {
      best = {
        score: score.score,

        location,
      };
    }
  }

  return best?.location ?? null;
}

function mergeHints(
  primaryAddress: string | null,
  hints: GeocodeHints,
): GeocodeHints {
  const parsed = extractIndonesiaAddressHints(primaryAddress);

  return {
    expectedText: hints.expectedText ?? primaryAddress,

    district: hints.district ?? parsed.district,

    city: hints.city ?? parsed.city,

    province: hints.province ?? parsed.province,

    postalCode: hints.postalCode ?? parsed.postalCode,

    country: hints.country ?? "Indonesia",
  };
}

function buildFallbackQueries(
  fallbackParts: Array<string | null | undefined>,

  hints: GeocodeHints,
): string[] {
  const queries: string[] = [];

  const explicitFallback = uniqueParts(fallbackParts)
    .map(cleanLocationText)
    .filter(Boolean)
    .join(", ");

  if (explicitFallback && normalizeForMatch(explicitFallback) !== "indonesia") {
    queries.push(explicitFallback);
  }

  const administrativeFallback = uniqueParts([
    hints.district,
    hints.city,
    hints.province,
    hints.postalCode,
    "Indonesia",
  ])
    .map(cleanLocationText)
    .filter(Boolean)
    .join(", ");

  if (
    administrativeFallback &&
    normalizeForMatch(administrativeFallback) !== "indonesia"
  ) {
    queries.push(administrativeFallback);
  }

  const broadFallback = uniqueParts([hints.city, hints.province, "Indonesia"])
    .map(cleanLocationText)
    .filter(Boolean)
    .join(", ");

  if (broadFallback && normalizeForMatch(broadFallback) !== "indonesia") {
    queries.push(broadFallback);
  }

  return [...new Set(queries)];
}

export async function geocodeWithFallback(
  primaryAddress: string | null,

  fallbackParts: Array<string | null | undefined>,

  hints: GeocodeHints = {},
): Promise<GeocodedLocation | null> {
  const primary = cleanLocationText(primaryAddress);

  const mergedHints = mergeHints(primary || null, hints);

  if (primary) {
    const exact = await searchGeocode(primary, mergedHints);

    if (exact) {
      return {
        ...exact,

        matchType: "exact",

        query: primary,
      };
    }
  }

  const fallbackQueries = buildFallbackQueries(fallbackParts, mergedHints);

  for (const query of fallbackQueries) {
    if (primary && normalizeForMatch(query) === normalizeForMatch(primary)) {
      continue;
    }

    const resolved = await searchGeocode(query, mergedHints);

    if (resolved) {
      return {
        ...resolved,

        matchType: "fallback",

        query,
      };
    }
  }

  /*
   * No candidate was sufficiently
   * consistent with the expected location.
   *
   * Returning null is safer than using
   * an incorrect coordinate.
   */
  return null;
}
