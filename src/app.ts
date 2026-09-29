import express from "express";
import path from "node:path";

import { requestIdMiddleware } from "./middleware/request-id.middleware.js";
import { requestLoggerMiddleware } from "./middleware/request-logger.middleware.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { copilotTeamsMiddleware } from "./middleware/copilot-teams.middleware.js";

import { authRouter } from "./routes/auth.route.js";
import { agentRouter } from "./routes/agent.route.js";

export const app = express();

/**
 * ============================================================
 * BODY PARSER
 * ============================================================
 */

app.use(
  express.json({
    limit: "10mb",
  }),
);

/**
 * ============================================================
 * COMMON MIDDLEWARE
 * ============================================================
 */

app.use(requestIdMiddleware);

app.use(requestLoggerMiddleware);

/**
 * ============================================================
 * STATIC DEV
 * ============================================================
 */

app.use("/dev", express.static(path.join(process.cwd(), "public", "dev")));

/**
 * ============================================================
 * AUTH
 * ============================================================
 */

app.use("/api/auth", authRouter);

/**
 * ============================================================
 * TEAMS / COPILOT INTERCEPTOR
 * ============================================================
 *
 * Copilot:
 *
 * webhook
 *   ↓
 * copilotTeamsMiddleware
 *   ↓
 * copilotBot
 *   ↓
 * runAgent()
 *   ↓
 * thread.post()
 *
 *
 * Direct Teams:
 *
 * webhook
 *   ↓
 * copilotTeamsMiddleware
 *   ↓
 * bukan Copilot
 *   ↓
 * next()
 *   ↓
 * agentRouter
 *   ↓
 * Mastra Channels
 */

app.post(
  "/api/agents/sales-cloud-agent/channels/teams/webhook",

  /**
   * Debug sementara.
   *
   * Setelah sudah stabil boleh dihapus.
   */
  (req, _res, next) => {
    console.log("[TEAMS WEBHOOK BEFORE ROUTING]", {
      type: req.body?.type ?? null,

      text: req.body?.text ?? null,

      conversationType: req.body?.conversation?.conversationType ?? null,

      conversationId: req.body?.conversation?.id ?? null,

      productContext: req.body?.channelData?.productContext ?? null,
    });

    next();
  },

  copilotTeamsMiddleware,
);

/**
 * ============================================================
 * AGENT ROUTES
 * ============================================================
 *
 * Direct Teams akan sampai ke sini
 * karena Copilot middleware memanggil next().
 */

app.use("/api/agents", agentRouter);

/**
 * ============================================================
 * HEALTH
 * ============================================================
 */

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",

    service: "EON AI Backend",

    requestId: req.requestId,
  });
});

/**
 * ============================================================
 * ERROR HANDLER
 * ============================================================
 */

app.use(errorMiddleware);
