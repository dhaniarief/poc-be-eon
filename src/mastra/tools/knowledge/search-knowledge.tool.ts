import { createTool } from "@mastra/core/tools";

import {
  knowledgeSearchInputSchema,
  knowledgeSearchResultSchema,
} from "../../schemas/knowledge.schema.js";

import {
  searchKnowledge,
  type KnowledgeSearchResult,
} from "../../../services/rag/knowledge-search.service.js";

/**
 * Check plain object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Try parsing JSON string.
 */
function tryParseJson(value: string): unknown | null {
  const trimmed = value.trim();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Detect KnowledgeSearchResult.
 */
function isKnowledgeSearchResult(
  value: unknown,
): value is KnowledgeSearchResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.found === "boolean" &&
    typeof value.query === "string" &&
    typeof value.totalCandidates === "number" &&
    typeof value.totalResults === "number" &&
    Array.isArray(value.results)
  );
}

/**
 * Mastra / AI SDK / Channel may wrap a tool result.
 *
 * This function searches common wrapper levels without making
 * assumptions about one specific runtime representation.
 */
function extractKnowledgeResult(input: unknown): KnowledgeSearchResult | null {
  const queue: unknown[] = [input];

  const visited = new Set<object>();

  let inspected = 0;

  while (queue.length > 0 && inspected < 40) {
    const current = queue.shift();

    inspected += 1;

    if (isKnowledgeSearchResult(current)) {
      return current;
    }

    /**
     * Sometimes result may be serialized JSON.
     */
    if (typeof current === "string") {
      const parsed = tryParseJson(current);

      if (parsed !== null) {
        queue.push(parsed);
      }

      continue;
    }

    /**
     * Traverse arrays such as content parts.
     */
    if (Array.isArray(current)) {
      for (const item of current.slice(0, 10)) {
        queue.push(item);
      }

      continue;
    }

    if (!isRecord(current)) {
      continue;
    }

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);

    /**
     * Common wrapper names used by tool runtimes/adapters.
     */
    const possibleKeys = [
      "output",
      "result",
      "value",
      "data",
      "content",
      "response",
      "toolResult",
      "toolOutput",
      "payload",
    ];

    for (const key of possibleKeys) {
      if (key in current) {
        queue.push(current[key]);
      }
    }
  }

  return null;
}

/**
 * Debug only the shape.
 * Do not dump entire SOP content into logs.
 */
function getShape(value: unknown) {
  if (value === null) {
    return {
      type: "null",
      keys: [],
    };
  }

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

export const searchKnowledgeTool = createTool({
  id: "knowledge.search",

  description: `
Search the synchronized EON internal SOP and IK knowledge base.

Use this tool on EVERY NEW USER TURN about:
- SOP / IK
- internal procedures
- responsibilities / PIC
- validation
- approval
- work instructions
- process steps
- SLA / duration / limits
- internal policy
- MIS operational guidance
- application development procedures

IMPORTANT:
- Previous conversation memory is not authoritative SOP/IK evidence.
- Use the user's current natural-language question as the query.
- If found=true, relevant internal evidence HAS BEEN FOUND.
- Answer from the returned evidence.
- Never say "not found" when found=true.
- Do not repeat this tool in the SAME user turn after found=true.
- Only say information was not found when found=false.
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

      bestContentLength: result.results[0]?.content?.length ?? 0,

      bestContentPreview: result.results[0]?.content?.slice(0, 250) ?? null,
    });

    return result;
  },

  /**
   * Tool lifecycle debugging.
   */
  onOutput: (args) => {
    const extracted = extractKnowledgeResult(args);

    console.log("[KNOWLEDGE TOOL ONOUTPUT]", {
      argsShape: getShape(args),

      extracted: extracted !== null,

      found: extracted?.found ?? null,

      query: extracted?.query ?? null,

      totalResults: extracted?.results.length ?? 0,

      firstTitle: extracted?.results[0]?.title ?? null,

      firstContentLength: extracted?.results[0]?.content?.length ?? 0,
    });
  },

  /**
   * Payload visible to the LLM.
   */
  toModelOutput: (rawOutput) => {
    const output = extractKnowledgeResult(rawOutput);

    console.log("[KNOWLEDGE TO MODEL DEBUG]", {
      rawShape: getShape(rawOutput),

      extracted: output !== null,

      found: output?.found ?? null,

      query: output?.query ?? null,

      resultCount: output?.results.length ?? 0,

      firstTitle: output?.results[0]?.title ?? null,

      firstContentLength: output?.results[0]?.content?.length ?? 0,
    });

    /**
     * IMPORTANT:
     *
     * Failure to extract runtime payload
     * DOES NOT mean "knowledge not found".
     */
    if (!output) {
      return {
        type: "text" as const,

        value: [
          "INTERNAL KNOWLEDGE SEARCH RESULT",
          "STATUS: TECHNICAL_ERROR",
          "",
          "The knowledge tool executed, but its structured result",
          "could not be converted into model-readable evidence.",
          "",
          "Do NOT interpret this as FOUND: FALSE.",
          "Do NOT claim that the SOP/IK does not contain the information.",
        ].join("\n"),
      };
    }

    /**
     * Real successful empty search.
     */
    if (output.found === false || output.results.length === 0) {
      return {
        type: "text" as const,

        value: [
          "INTERNAL KNOWLEDGE SEARCH RESULT",
          "STATUS: SUCCESS",
          "FOUND: FALSE",
          `QUERY: ${output.query}`,
          "",
          "The internal SOP/IK search completed successfully,",
          "but no relevant evidence was found.",
        ].join("\n"),
      };
    }

    /**
     * Relevant evidence exists.
     *
     * Top 3 chunks is enough.
     */
    const evidence = output.results
      .slice(0, 3)
      .map((item, index) => {
        return [
          `EVIDENCE ${index + 1}`,
          `Title: ${item.title}`,
          `Document Number: ${item.docNumber ?? "-"}`,
          `Document Type: ${item.docType ?? "-"}`,
          `Process: ${item.process ?? "-"}`,
          `Version: ${item.docVersion ?? "-"}`,
          `Score: ${item.score}`,
          `Source: ${item.sourceUrl ?? "-"}`,
          "",
          "CONTENT:",
          item.content,
        ].join("\n");
      })
      .join("\n\n----------------------------------------\n\n");

    return {
      type: "text" as const,

      value: [
        "INTERNAL KNOWLEDGE SEARCH RESULT",
        "STATUS: SUCCESS",
        "FOUND: TRUE",
        `QUERY: ${output.query}`,
        `TOTAL RESULTS: ${output.totalResults}`,
        "",
        "Relevant official EON internal SOP/IK evidence was found.",
        "Answer the user's question from the evidence below.",
        "Do NOT say the information was not found.",
        "",
        evidence,
      ].join("\n"),
    };
  },
});
