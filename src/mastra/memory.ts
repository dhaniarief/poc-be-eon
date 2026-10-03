import { Memory } from "@mastra/memory";
import { env } from "../config/env.js";
import { mastraPostgresStore } from "./storage.js";

/**
 * Conversation memory is intentionally PostgreSQL-backed.
 *
 * resourceId = user/account scope
 * threadId   = individual conversation
 * Memory is for conversational continuity only. Business entities are resolved
 * to live CRM/FinOps data on relevant turns; memory is never operational truth.
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
