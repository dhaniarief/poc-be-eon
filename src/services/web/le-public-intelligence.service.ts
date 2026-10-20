import { searchSearxng } from "./searxng.service.js";

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
