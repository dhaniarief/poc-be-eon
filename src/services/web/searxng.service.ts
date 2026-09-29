import { env } from "../../config/env.js";

export type SearxngSearchResult = {
  title: string;
  url: string;
  snippet: string;
  engine?: string;
};

export type RawSearxngResult = {
  title?: string;
  url?: string;
  content?: string;
  engine?: string;
};

type SearxngResponse = {
  results?: RawSearxngResult[];
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeUrlForDedupe(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.split("#", 1)[0].trim().toLowerCase();
  }
}

export function normalizeSearxngResults(
  rawResults: RawSearxngResult[],
  options: {
    maxResults: number;
    maxSnippetChars: number;
  },
): SearxngSearchResult[] {
  const seenUrls = new Set<string>();
  const seenRows = new Set<string>();
  const normalized: SearxngSearchResult[] = [];

  for (const item of rawResults) {
    const url = item.url?.trim() ?? "";
    if (!url) continue;

    const title = normalizeWhitespace(item.title ?? "") || "Untitled";
    const normalizedUrl = normalizeUrlForDedupe(url);
    const rowKey = `${title.toLowerCase()}|${normalizedUrl}`;

    if (seenUrls.has(normalizedUrl) || seenRows.has(rowKey)) {
      continue;
    }

    seenUrls.add(normalizedUrl);
    seenRows.add(rowKey);

    const snippet = normalizeWhitespace(item.content ?? "").slice(
      0,
      options.maxSnippetChars,
    );

    normalized.push({
      title,
      url,
      snippet,
      ...(item.engine ? { engine: item.engine } : {}),
    });

    if (normalized.length >= options.maxResults) break;
  }

  return normalized;
}

export async function searchSearxng(
  query: string,
): Promise<SearxngSearchResult[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.SEARXNG_TIMEOUT_MS);

  try {
    const url = new URL("/search", env.SEARXNG_BASE_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`SearXNG request failed with status ${response.status}`);
    }

    const data = (await response.json()) as SearxngResponse;

    return normalizeSearxngResults(data.results ?? [], {
      maxResults: env.SEARXNG_MAX_RESULTS,
      maxSnippetChars: env.SEARXNG_SNIPPET_MAX_CHARS,
    });
  } finally {
    clearTimeout(timeout);
  }
}
