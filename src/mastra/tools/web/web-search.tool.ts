import { createTool } from "@mastra/core/tools";
import { toTextModelOutput } from "../../runtime/model-output.js";
import { z } from "zod";
import { searchSearxng } from "../../../services/web/searxng.service.js";

export const webSearchTool = createTool({
  id: "web.search",
  description:
    "Search the public web using EON's SearXNG backend. Use for current public company information, stakeholder research, competitor/market candidates, industry context, news, or other external evidence not available from internal EON systems.",
  inputSchema: z.object({
    query: z
      .string()
      .min(2)
      .describe("Focused public web search query using verified business context"),
  }),
  outputSchema: z.object({
    query: z.string(),
    provider: z.literal("searxng"),
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
        engine: z.string().optional(),
      }),
    ),
  }),
  execute: async ({ query }) => ({
    query,
    provider: "searxng" as const,
    results: await searchSearxng(query),
  }),
  toModelOutput: (output) => toTextModelOutput("web.search", output),
});
