import express from "express";
import path from "node:path";
import { requestIdMiddleware } from "./middleware/request-id.middleware.js";
import { requestLoggerMiddleware } from "./middleware/request-logger.middleware.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { authRouter } from "./routes/auth.route.js";
import { agentRouter } from "./routes/agent.route.js";

export const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);

app.use("/dev", express.static(path.join(process.cwd(), "public", "dev")));
app.use("/api/auth", authRouter);

/**
 * REST endpoint kept for development/integration tests.
 * Microsoft Teams production traffic is handled directly by Mastra Channels
 * through the Teams adapter configured on sales-cloud-agent.
 */
app.use("/api/agents", agentRouter);

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "EON AI Backend",
    requestId: req.requestId,
  });
});

app.use(errorMiddleware);
