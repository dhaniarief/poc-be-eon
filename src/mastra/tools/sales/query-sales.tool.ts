import { createTool } from "@mastra/core/tools";
import {
  querySalesInputSchema,
  salesObjectOutputSchema,
} from "../../schemas/sales.schema.js";
import { querySales } from "../../../services/sales/sales-intelligence.service.js";
import { toTextModelOutput } from "../../runtime/model-output.js";
import { env } from "../../../config/env.js";

export const querySalesTool = createTool({
  id: "sales.query",
  description:
    "Aggregate CRM and FinOps sales metrics using canonical CRM IDs. " +
    "Supports Opportunity count, estimated revenue, actual revenue " +
    "(Opportunity actualvalue + partial revenue), partial revenue/count, " +
    "quantity by UOM, SO/DO/invoice counts, and invoice amount. " +
    "For Top/Bottom/ranking requests, use sortBy, sortDirection, and limit. " +
    "Aggregation, sorting, and limiting are performed by the backend, not by the model. " +
    "If this tool returns status=timeout or retryable=false, do not call it again in the same turn.",

  inputSchema: querySalesInputSchema,
  outputSchema: salesObjectOutputSchema,

  execute: async (input) => {
    const startedAt = Date.now();
    const signal = AbortSignal.timeout(env.SALES_QUERY_TIMEOUT_MS);

    console.log(
      `[sales.query] started, timeout=${env.SALES_QUERY_TIMEOUT_MS}ms`,
    );

    try {
      const result = await querySales(input, { signal });

      console.log(`[sales.query] completed in ${Date.now() - startedAt}ms`);

      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      if (signal.aborted) {
        console.warn(`[sales.query] ABORTED after ${durationMs}ms`);

        return {
          ok: false,
          status: "timeout",
          errorCode: "SALES_QUERY_TIMEOUT",
          retryable: false,
          message:
            "Query sales melewati batas waktu pemrosesan. " +
            "Jangan ulangi sales.query yang sama pada turn ini. " +
            "Beritahu user bahwa query terlalu besar dan tidak berhasil diselesaikan.",
          durationMs,
          timeoutMs: env.SALES_QUERY_TIMEOUT_MS,
          filters: input.filters ?? {},
          groupBy: input.groupBy ?? "none",
          metrics: input.metrics,
          summary: {},
          groups: [],
        };
      }

      console.error(`[sales.query] failed after ${durationMs}ms`, error);

      throw error;
    }
  },

  toModelOutput: (output) => toTextModelOutput("sales.query", output),
});
