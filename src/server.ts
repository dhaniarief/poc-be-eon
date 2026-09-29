import http from "node:http";
import { MastraServer } from "@mastra/express";

import { app } from "./app.js";
import { mastra } from "./mastra/index.js";
import { env } from "./config/env.js";
import { writeBusinessEvent } from "./logging/operation-logger.js";
import { startRagSyncScheduler } from "./services/rag/rag-sync.scheduler.js";

// ======================================================
// Mastra API + Channels
// ======================================================

const mastraServer = new MastraServer({
  app,
  mastra,
});

await mastraServer.init();

// ======================================================
// HTTP Server
// ======================================================

const httpServer = http.createServer(app);

httpServer.listen(env.PORT, env.HOST, () => {
  writeBusinessEvent("info", "APP_START", {
    host: env.HOST,
    port: env.PORT,
    environment: env.NODE_ENV,
  });

  startRagSyncScheduler();
});
