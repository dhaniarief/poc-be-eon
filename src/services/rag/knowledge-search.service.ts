import { env } from "../../config/env.js";
import { createEmbedding } from "./embedding.service.js";
import { getRagSearchCandidates } from "./rag.repository.js";

export type KnowledgeSearchResult = {
  found: boolean;
  query: string;
  totalCandidates: number;
  totalResults: number;
  results: Array<{
    score: number;
    semanticScore: number;
    lexicalScore: number;
    chunkIndex: number;
    content: string;
    title: string;
    category: string | null;
    productName: string | null;
    industryTypes: string[];
    applications: string[];
    equipment: string[];
    sourceUrl: string | null;
    sourceModifiedAt: string | null;
  }>;
};

export type KnowledgeSearchInput = {
  query: string;
  topK?: number;
  industryTypes?: string[];
};

export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return -1;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;

    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA === 0 || normB === 0) return -1;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "yang",
  "dan",
  "atau",
  "di",
  "ke",
  "dari",
  "untuk",
  "dengan",
  "pada",
  "dalam",
  "oleh",
  "apa",
  "siapa",
  "bagaimana",
  "berapa",
  "apakah",
  "ini",
  "itu",
  "nya",
  "sebuah",
  "suatu",
]);

function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function lexicalSimilarity(query: string, text: string) {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) return 0;

  const normalizedText = normalizeText(text);

  let matched = 0;
  for (const token of queryTokens) {
    if (normalizedText.includes(token)) matched += 1;
  }

  return matched / queryTokens.length;
}

function calculateFieldBoost(
  query: string,
  value: string | null,
  maxBoost: number,
) {
  if (!value) return 0;

  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) return 0;

  const normalizedValue = normalizeText(value);
  const matches = queryTokens.filter((token) =>
    normalizedValue.includes(token),
  ).length;

  const ratio = matches / queryTokens.length;

  if (ratio >= 0.75) return maxBoost;
  if (ratio >= 0.5) return maxBoost * 0.6;
  if (ratio > 0) return maxBoost * 0.3;
  return 0;
}

export async function searchKnowledge(
  input: KnowledgeSearchInput,
): Promise<KnowledgeSearchResult> {
  const query = input.query.trim();

  if (!query) {
    throw new Error("Product Knowledge search query cannot be empty.");
  }

  const topK = Math.max(1, Math.min(input.topK ?? env.RAG_SEARCH_TOP_K, 20));

  const candidates = await getRagSearchCandidates({
    sourceKey: env.RAG_PRODUCT_SOURCE_KEY,
    industryTypesAny: input.industryTypes,
  });

  if (candidates.length === 0) {
    console.log("[RAG SEARCH]", {
      query,
      found: false,
      reason: "NO_PRODUCT_KNOWLEDGE_CANDIDATES",
      industryTypes: input.industryTypes ?? [],
    });

    return {
      found: false,
      query,
      totalCandidates: 0,
      totalResults: 0,
      results: [],
    };
  }

  const queryEmbedding = await createEmbedding(query);

  const allRanked = candidates
    .map((candidate) => {
      const semanticScore = cosineSimilarity(
        queryEmbedding,
        candidate.embedding,
      );

      const lexicalText = [
        candidate.title,
        candidate.category ?? "",
        candidate.productName ?? "",
        candidate.industryTypes.join(" "),
        candidate.applications.join(" "),
        candidate.equipment.join(" "),
        candidate.content,
      ].join("\n");

      const lexicalScore = lexicalSimilarity(query, lexicalText);

      const titleBoost = calculateFieldBoost(query, candidate.title, 0.08);
      const productBoost = calculateFieldBoost(
        query,
        candidate.productName,
        0.08,
      );

      const hybridScore =
        semanticScore * 0.75 +
        lexicalScore * 0.25 +
        titleBoost +
        productBoost;

      return {
        candidate,
        semanticScore,
        lexicalScore,
        titleBoost,
        productBoost,
        score: Math.min(1, hybridScore),
      };
    })
    .sort((a, b) => b.score - a.score);

  console.log(
    "[RAG SEARCH DEBUG]",
    JSON.stringify(
      {
        query,
        sourceKey: env.RAG_PRODUCT_SOURCE_KEY,
        industryTypes: input.industryTypes ?? [],
        minScore: env.RAG_MIN_SCORE,
        totalCandidates: candidates.length,
        topResults: allRanked.slice(0, 5).map((item) => ({
          title: item.candidate.title,
          productName: item.candidate.productName,
          chunkIndex: item.candidate.chunkIndex,
          semanticScore: Number(item.semanticScore.toFixed(6)),
          lexicalScore: Number(item.lexicalScore.toFixed(6)),
          titleBoost: Number(item.titleBoost.toFixed(6)),
          productBoost: Number(item.productBoost.toFixed(6)),
          finalScore: Number(item.score.toFixed(6)),
        })),
      },
      null,
      2,
    ),
  );

  let selected = allRanked
    .filter((item) => item.score >= env.RAG_MIN_SCORE)
    .slice(0, topK);

  if (selected.length === 0) {
    selected = allRanked
      .filter((item) => item.semanticScore >= 0.18 || item.lexicalScore >= 0.25)
      .slice(0, Math.min(topK, 3));
  }

  const results = selected.map(
    ({ candidate, score, semanticScore, lexicalScore }) => ({
      score: Number(score.toFixed(6)),
      semanticScore: Number(semanticScore.toFixed(6)),
      lexicalScore: Number(lexicalScore.toFixed(6)),
      chunkIndex: candidate.chunkIndex,
      content: candidate.content,
      title: candidate.title,
      category: candidate.category,
      productName: candidate.productName,
      industryTypes: candidate.industryTypes,
      applications: candidate.applications,
      equipment: candidate.equipment,
      sourceUrl: candidate.sourceUrl,
      sourceModifiedAt: candidate.sourceModifiedAt,
    }),
  );

  console.log("[RAG SEARCH RESULT]", {
    query,
    found: results.length > 0,
    totalCandidates: candidates.length,
    totalResults: results.length,
    bestScore: results[0]?.score ?? null,
    bestTitle: results[0]?.title ?? null,
  });

  return {
    found: results.length > 0,
    query,
    totalCandidates: candidates.length,
    totalResults: results.length,
    results,
  };
}
