import { Memory } from "@mastra/memory";
import { env } from "../config/env.js";
import { mastraPostgresStore } from "./storage.js";

/**
 * Conversation memory is intentionally PostgreSQL-backed.
 *
 * resourceId = user/account scope
 * threadId   = individual conversation
 * opportunityId remains RequestContext and is NOT treated as source-of-truth
 * memory for operational facts such as current stock or Sales Order state.
 */
export const agentMemory = mastraPostgresStore
  ? new Memory({
      storage: mastraPostgresStore,
      options: {
        lastMessages: env.MASTRA_MEMORY_LAST_MESSAGES,
        observationalMemory: env.MASTRA_OBSERVATIONAL_MEMORY,
      },
    })
  : undefined;
