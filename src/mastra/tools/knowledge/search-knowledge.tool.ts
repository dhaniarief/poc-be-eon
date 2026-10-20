import { createTool } from "@mastra/core/tools";

import {
  knowledgeSearchInputSchema,
  knowledgeSearchResultSchema,
} from "../../schemas/knowledge.schema.js";
import {
  searchKnowledge,
  type KnowledgeSearchResult,
} from "../../../services/rag/knowledge-search.service.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryParseJson(value: string): unknown | null {
  const trimmed = value.trim();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function isKnowledgeSearchResult(
  value: unknown,
): value is KnowledgeSearchResult {
  if (!isRecord(value)) return false;

  return (
    typeof value.found === "boolean" &&
    typeof value.query === "string" &&
    typeof value.totalCandidates === "number" &&
    typeof value.totalResults === "number" &&
    Array.isArray(value.results)
  );
}

export function extractKnowledgeResult(
  input: unknown,
): KnowledgeSearchResult | null {
  const queue: unknown[] = [input];
  const visited = new Set<object>();
  let inspected = 0;

  while (queue.length > 0 && inspected < 40) {
    const current = queue.shift();
    inspected += 1;

    if (isKnowledgeSearchResult(current)) return current;

    if (typeof current === "string") {
      const parsed = tryParseJson(current);
      if (parsed !== null) queue.push(parsed);
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current.slice(0, 10));
      continue;
    }

    if (!isRecord(current)) continue;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const key of [
      "output",
      "result",
      "value",
      "data",
      "content",
      "response",
      "toolResult",
      "toolOutput",
      "payload",
    ]) {
      if (key in current) queue.push(current[key]);
    }
  }

  return null;
}

function getShape(value: unknown) {
  if (value === null) return { type: "null", keys: [] };

  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      firstItemType: value.length > 0 ? typeof value[0] : null,
    };
  }

  if (typeof value === "object") {
    return {
      type: "object",
      keys: Object.keys(value as Record<string, unknown>),
    };
  }

  return {
    type: typeof value,
    preview: typeof value === "string" ? value.slice(0, 200) : String(value),
  };
}

export function knowledgeResultToModelOutput(rawOutput: unknown) {
  const output = extractKnowledgeResult(rawOutput);

  if (!output) {
    return {
      type: "text" as const,
      value: [
        "PRODUCT KNOWLEDGE SEARCH RESULT",
        "STATUS: TECHNICAL_ERROR",
        "",
        "The Product Knowledge tool executed, but its structured result",
        "could not be converted into model-readable evidence.",
        "",
        "Do NOT interpret this as FOUND: FALSE.",
      ].join("\n"),
    };
  }

  if (output.found === false || output.results.length === 0) {
    return {
      type: "text" as const,
      value: [
        "PRODUCT KNOWLEDGE SEARCH RESULT",
        "STATUS: SUCCESS",
        "FOUND: FALSE",
        `QUERY: ${output.query}`,
        "",
        "The Product Knowledge search completed successfully,",
        "but no relevant evidence was found.",
      ].join("\n"),
    };
  }

  const evidence = output.results
    .slice(0, 3)
    .map((item, index) =>
      [
        `EVIDENCE ${index + 1}`,
        `Title: ${item.title}`,
        `Category: ${item.category ?? "-"}`,
        `Product: ${item.productName ?? "-"}`,
        `Industry: ${item.industryTypes.join(", ") || "-"}`,
        `Application: ${item.applications.join(", ") || "-"}`,
        `Equipment: ${item.equipment.join(", ") || "-"}`,
        `Score: ${item.score}`,
        `Document URL: ${item.sourceUrl ?? "-"}`,
        "",
        "CONTENT:",
        item.content,
      ].join("\n"),
    )
    .join("\n\n----------------------------------------\n\n");

  return {
    type: "text" as const,
    value: [
      "PRODUCT KNOWLEDGE SEARCH RESULT",
      "STATUS: SUCCESS",
      "FOUND: TRUE",
      `QUERY: ${output.query}`,
      `TOTAL RESULTS: ${output.totalResults}`,
      "",
      "Relevant official EON Product Knowledge evidence was found.",
      "Answer from the evidence below.",
      "Use Product, Industry, Application, and Equipment metadata when relevant.",
      "If Document URL is available and the answer uses that document, include the most relevant document link.",
      "If the user asks for the PDF, file, source, document, or link, ALWAYS provide the returned Document URL.",
      "Never invent or reconstruct a SharePoint URL.",
      "",
      evidence,
    ].join("\n"),
  };
}

export const searchKnowledgeTool = createTool({
  id: "knowledge.search",

  description: `
Search the synchronized EON Product Knowledge library from SharePoint /sites/aidata/Product Knowledge.

Use on every new relevant user turn for:
- product information
- product application / technical reference
- product recommendation by application or equipment
- equipment-specific product knowledge
- MSDS / SDS documents stored in Product Knowledge
- success story / customer testimonial / case study
- training material
- industry-specific product knowledge

This tool does NOT contain SOP/IK knowledge.
Previous conversation memory is not authoritative Product Knowledge evidence.
Only say information was not found when this tool returns found=false.
`.trim(),

  inputSchema: knowledgeSearchInputSchema,
  outputSchema: knowledgeSearchResultSchema,

  execute: async (input) => {
    const result = await searchKnowledge(input);

    console.log("[KNOWLEDGE TOOL EXECUTE]", {
      query: result.query,
      found: result.found,
      totalCandidates: result.totalCandidates,
      totalResults: result.totalResults,
      bestTitle: result.results[0]?.title ?? null,
      bestScore: result.results[0]?.score ?? null,
    });

    return result;
  },

  onOutput: (args) => {
    const extracted = extractKnowledgeResult(args);

    console.log("[KNOWLEDGE TOOL ONOUTPUT]", {
      argsShape: getShape(args),
      extracted: extracted !== null,
      found: extracted?.found ?? null,
      query: extracted?.query ?? null,
      totalResults: extracted?.results.length ?? 0,
      firstTitle: extracted?.results[0]?.title ?? null,
    });
  },

  toModelOutput: knowledgeResultToModelOutput,
});
