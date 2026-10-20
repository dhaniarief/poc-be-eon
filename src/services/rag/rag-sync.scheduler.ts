import { env } from "../../config/env.js";
import { writeBusinessEvent } from "../../logging/operation-logger.js";
import { syncProductKnowledge } from "./product-knowledge-rag-sync.service.js";

let timer: NodeJS.Timeout | null = null;
let running = false;

async function runScheduledSync() {
  if (running) {
    writeBusinessEvent("warn", "RAG_SYNC_SKIPPED", {
      reason: "previous_sync_still_running",
    });
    return;
  }

  running = true;

  try {
    await syncProductKnowledge();
  } catch (error) {
    writeBusinessEvent("error", "RAG_SYNC_SCHEDULED_FAILED", {
      source: "product-knowledge",
      error: error instanceof Error ? error.message : String(error),
    });
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
    sourceKey: env.RAG_PRODUCT_SOURCE_KEY,
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
