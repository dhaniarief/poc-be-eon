import { searchSearxng } from "./searxng.service.js";

/**
 * LOCAL-only public intelligence search.
 *
 * Cloud / Teams does not call this service. The cloud LE Mining agent uses
 * OpenAI native web_search directly from @ai-sdk/openai.
 */
export async function searchLePublicIntelligence(query: string) {
  const cleanQuery = query.trim();

  if (!cleanQuery) {
    throw new Error("Public intelligence query cannot be empty.");
  }

  return {
    query: cleanQuery,
    provider: "searxng-public" as const,
    results: await searchSearxng(cleanQuery),
  };
}
