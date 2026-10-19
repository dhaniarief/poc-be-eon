import { env } from "../../config/env.js";
import { writeBusinessEvent } from "../../logging/operation-logger.js";
import { syncProductKnowledge } from "./product-knowledge-rag-sync.service.js";
import { syncSharePointKnowledge } from "./sharepoint-rag-sync.service.js";

let timer: NodeJS.Timeout | null = null;
let running = false;

async function runConfiguredSyncs() {
  const failures: Array<{ source: string; error: string }> = [];

  if (env.RAG_SOP_SYNC_ENABLED) {
    try {
      await syncSharePointKnowledge();
    } catch (error) {
      failures.push({
        source: "sop-ik",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (env.RAG_PRODUCT_SYNC_ENABLED) {
    try {
      await syncProductKnowledge();
    } catch (error) {
      failures.push({
        source: "product-knowledge",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (failures.length > 0) {
    writeBusinessEvent("error", "RAG_SYNC_SCHEDULED_FAILED", {
      failures,
    });
  }
}

async function runScheduledSync() {
  if (running) {
    writeBusinessEvent("warn", "RAG_SYNC_SKIPPED", {
      reason: "previous_sync_still_running",
    });
    return;
  }

  running = true;

  try {
    await runConfiguredSyncs();
  } finally {
    running = false;
  }
}

export function startRagSyncScheduler() {
  if (!env.RAG_SYNC_ENABLED) {
    writeBusinessEvent("info", "RAG_SYNC_DISABLED");
    return;
  }

  if (timer) return;

  writeBusinessEvent("info", "RAG_SYNC_SCHEDULER_START", {
    intervalMs: env.RAG_SYNC_INTERVAL_MS,
    syncOnStart: env.RAG_SYNC_ON_START,
    sopEnabled: env.RAG_SOP_SYNC_ENABLED,
    productKnowledgeEnabled: env.RAG_PRODUCT_SYNC_ENABLED,
  });

  if (env.RAG_SYNC_ON_START) {
    void runScheduledSync();
  }

  timer = setInterval(() => {
    void runScheduledSync();
  }, env.RAG_SYNC_INTERVAL_MS);

  timer.unref();
}

export function stopRagSyncScheduler() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
