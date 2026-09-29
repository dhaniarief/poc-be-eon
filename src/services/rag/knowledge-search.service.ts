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
    docNumber: string | null;
    docType: string | null;
    process: string | null;
    docVersion: number | null;
    sourceUrl: string | null;
    sourceModifiedAt: string | null;
  }>;
};

/**
 * Cosine similarity untuk embedding.
 */
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

  if (normA === 0 || normB === 0) {
    return -1;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Normalisasi text untuk lexical search.
 */
function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stop words sederhana.
 *
 * Jangan terlalu agresif karena beberapa kata Bahasa Indonesia
 * tetap penting dalam SOP.
 */
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
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

/**
 * Score lexical berdasarkan overlap keyword query vs document.
 *
 * Nilai:
 * 0   = tidak ada keyword yang match
 * 1   = seluruh keyword match
 */
function lexicalSimilarity(query: string, text: string) {
  const queryTokens = [...new Set(tokenize(query))];

  if (queryTokens.length === 0) {
    return 0;
  }

  const normalizedText = normalizeText(text);

  let matched = 0;

  for (const token of queryTokens) {
    if (normalizedText.includes(token)) {
      matched += 1;
    }
  }

  return matched / queryTokens.length;
}

/**
 * Boost jika query berhubungan kuat dengan title dokumen.
 *
 * Contoh:
 * query  : prosedur pengembangan aplikasi
 * title  : SOP PENGEMBANGAN APLIKASI
 */
function calculateTitleBoost(query: string, title: string) {
  const queryTokens = [...new Set(tokenize(query))];

  if (queryTokens.length === 0) {
    return 0;
  }

  const normalizedTitle = normalizeText(title);

  const matches = queryTokens.filter((token) =>
    normalizedTitle.includes(token),
  ).length;

  const ratio = matches / queryTokens.length;

  if (ratio >= 0.75) {
    return 0.1;
  }

  if (ratio >= 0.5) {
    return 0.06;
  }

  if (ratio > 0) {
    return 0.03;
  }

  return 0;
}

export async function searchKnowledge(input: {
  query: string;
  topK?: number;
  docType?: string | null;
  process?: string | null;
}): Promise<KnowledgeSearchResult> {
  const query = input.query.trim();

  if (!query) {
    throw new Error("Knowledge search query cannot be empty.");
  }

  const topK = Math.max(1, Math.min(input.topK ?? env.RAG_SEARCH_TOP_K, 20));

  let candidates = await getRagSearchCandidates({
    docType: input.docType,
    process: input.process,
  });

  /**
   * Metadata filters are optional hints.
   *
   * LLM may send natural-language values such as:
   * process = "pengembangan aplikasi"
   *
   * while SharePoint metadata actually contains:
   * process = "IT"
   *
   * If filtering removes all candidates, automatically retry
   * without metadata filters instead of returning "not found".
   */
  if (candidates.length === 0 && (input.docType || input.process)) {
    console.log("[RAG SEARCH FILTER FALLBACK]", {
      query,
      requestedDocType: input.docType ?? null,
      requestedProcess: input.process ?? null,
      reason: "FILTERED_CANDIDATES_EMPTY",
    });

    candidates = await getRagSearchCandidates({});
  }

  if (candidates.length === 0) {
    console.log("[RAG SEARCH]", {
      query,
      found: false,
      reason: "NO_CANDIDATES",
    });

    return {
      found: false,
      query,
      totalCandidates: 0,
      totalResults: 0,
      results: [],
    };
  }

  /**
   * Embedding query.
   */
  const queryEmbedding = await createEmbedding(query);

  /**
   * Hybrid ranking:
   *
   * 80% semantic
   * 20% lexical
   * + title boost
   */
  const allRanked = candidates
    .map((candidate) => {
      const semanticScore = cosineSimilarity(
        queryEmbedding,
        candidate.embedding,
      );

      const lexicalText = [
        candidate.title,
        candidate.docNumber ?? "",
        candidate.docType ?? "",
        candidate.process ?? "",
        candidate.content,
      ].join("\n");

      const lexicalScore = lexicalSimilarity(query, lexicalText);

      const titleBoost = calculateTitleBoost(query, candidate.title);

      const hybridScore = semanticScore * 0.8 + lexicalScore * 0.2 + titleBoost;

      return {
        candidate,
        semanticScore,
        lexicalScore,
        titleBoost,
        score: Math.min(1, hybridScore),
      };
    })
    .sort((a, b) => b.score - a.score);

  /**
   * Debug supaya kita tahu apa yang sebenarnya ditemukan.
   */
  console.log(
    "[RAG SEARCH DEBUG]",
    JSON.stringify(
      {
        query,
        docType: input.docType ?? null,
        process: input.process ?? null,
        minScore: env.RAG_MIN_SCORE,
        totalCandidates: candidates.length,

        topResults: allRanked.slice(0, 5).map((item) => ({
          title: item.candidate.title,
          chunkIndex: item.candidate.chunkIndex,
          semanticScore: Number(item.semanticScore.toFixed(6)),
          lexicalScore: Number(item.lexicalScore.toFixed(6)),
          titleBoost: Number(item.titleBoost.toFixed(6)),
          finalScore: Number(item.score.toFixed(6)),
        })),
      },
      null,
      2,
    ),
  );

  /**
   * Normal search berdasarkan minimum threshold.
   */
  let selected = allRanked
    .filter((item) => item.score >= env.RAG_MIN_SCORE)
    .slice(0, topK);

  /**
   * Soft fallback.
   *
   * Kalau hybrid threshold tidak lolos tetapi ada candidate
   * dengan semantic cukup masuk akal atau lexical matching kuat,
   * tetap berikan beberapa hasil ke LLM.
   *
   * Ini berguna untuk variasi Bahasa Indonesia.
   */
  if (selected.length === 0) {
    selected = allRanked
      .filter((item) => item.semanticScore >= 0.18 || item.lexicalScore >= 0.25)
      .slice(0, Math.min(topK, 3));
  }

  const ranked = selected.map(
    ({ candidate, score, semanticScore, lexicalScore }) => ({
      score: Number(score.toFixed(6)),
      semanticScore: Number(semanticScore.toFixed(6)),
      lexicalScore: Number(lexicalScore.toFixed(6)),

      chunkIndex: candidate.chunkIndex,
      content: candidate.content,

      title: candidate.title,
      docNumber: candidate.docNumber,
      docType: candidate.docType,
      process: candidate.process,
      docVersion: candidate.docVersion,

      sourceUrl: candidate.sourceUrl,
      sourceModifiedAt: candidate.sourceModifiedAt,
    }),
  );

  console.log("[RAG SEARCH RESULT]", {
    query,
    found: ranked.length > 0,
    totalCandidates: candidates.length,
    totalResults: ranked.length,
    bestScore: ranked.length > 0 ? ranked[0]?.score : null,
    bestTitle: ranked.length > 0 ? ranked[0]?.title : null,
  });

  return {
    found: ranked.length > 0,
    query,
    totalCandidates: candidates.length,
    totalResults: ranked.length,
    results: ranked,
  };
}
