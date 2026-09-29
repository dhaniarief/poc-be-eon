import { Router } from "express";

import { chatAgent } from "../controllers/agent.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

export const agentRouter = Router();

agentRouter.post("/:agentId/chat", authMiddleware, chatAgent);
