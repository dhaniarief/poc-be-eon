import { env } from "../../config/env.js";
import { searchSearxng, type SearxngSearchResult } from "./searxng.service.js";

export const LE_PUBLIC_ALLOWED_DOMAINS = [
  "eonchemicals.com",
  "lelubricants.com",
  "lubetechnologies.com",
] as const;

function isAllowedUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");

    return LE_PUBLIC_ALLOWED_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

function normalizedUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

export async function searchLePublicWeb(query: string) {
  const cleanQuery = query.trim();
  if (!cleanQuery) throw new Error("LE public web query cannot be empty.");

  const searches = LE_PUBLIC_ALLOWED_DOMAINS.map((domain) =>
    searchSearxng(`${cleanQuery} site:${domain}`),
  );

  const settled = await Promise.allSettled(searches);
  const merged: SearxngSearchResult[] = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      merged.push(...result.value);
    }
  }

  const seen = new Set<string>();
  const results: SearxngSearchResult[] = [];

  for (const item of merged) {
    if (!isAllowedUrl(item.url)) continue;

    const key = normalizedUrl(item.url);
    if (seen.has(key)) continue;
    seen.add(key);

    results.push(item);
    if (results.length >= env.SEARXNG_MAX_RESULTS) break;
  }

  return {
    query: cleanQuery,
    provider: "searxng-restricted" as const,
    allowedDomains: [...LE_PUBLIC_ALLOWED_DOMAINS],
    results,
  };
}
